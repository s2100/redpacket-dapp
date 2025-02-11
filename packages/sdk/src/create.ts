import axios from 'axios'
import type {ApiPromise} from '@polkadot/api'
import {
  u8aToHex,
  hexToU8a,
  hexAddPrefix,
  stringToHex,
  hexStripPrefix,
} from '@polkadot/util'
import {
  waitReady,
  sr25519KeypairFromSeed,
  sr25519Sign,
  sr25519Agree,
} from '@polkadot/wasm-crypto'
import type {ContractCallRequest, AccountId} from '@polkadot/types/interfaces'
import type {ISubmittableResult} from '@polkadot/types/types'
import {from} from 'rxjs'
import {encrypt, decrypt} from './lib/aes-256-gcm'
import {randomHex} from './lib/hex'
import type {CertificateData} from './certificate'
import {pruntime_rpc, prpc} from './proto'
import type {SubmittableExtrinsic} from '@polkadot/api/types'

export type Query = (
  encodedQuery: string,
  certificateData: CertificateData
) => Promise<string>

type EncryptedData = {
  iv: string
  pubkey: string
  data: string
}

type CreateEncryptedData = (
  data: string,
  agreementKey: Uint8Array
) => EncryptedData

export type Command = (params: {
  contractId: string
  payload: string
}) => SubmittableExtrinsic<'promise', ISubmittableResult>

export interface PhalaInstance {
  query: Query
  command: Command
}

type CreateFn = (options: {
  api: ApiPromise
  baseURL: string
  contractId: string
}) => Promise<ApiPromise>

export const create: CreateFn = async ({api, baseURL, contractId}) => {
  await waitReady()

  // Create a http client prepared for protobuf
  const http = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    responseType: 'arraybuffer',
  }).post

  // Get public key from remote for encrypting
  const {public_key} = pruntime_rpc.PhactoryInfo.decode(
    new Uint8Array((await http<ArrayBuffer>('/prpc/PhactoryAPI.GetInfo')).data)
  )

  if (!public_key) throw new Error('No remote pubkey')
  const remotePubkey = hexAddPrefix(public_key)

  // Create a query instance with protobuf set
  const contractQuery = (data: pruntime_rpc.IContractQueryRequest) =>
    http<ArrayBuffer>('/prpc/PhactoryAPI.ContractQuery', data, {
      transformRequest: (data: pruntime_rpc.IContractQueryRequest) =>
        pruntime_rpc.ContractQueryRequest.encode(data).finish(),
    })
      .then((res) => {
        return {
          ...res,
          data: pruntime_rpc.ContractQueryResponse.decode(
            new Uint8Array(res.data)
          ),
        }
      })
      .catch((err) => {
        if (err.response?.data instanceof ArrayBuffer) {
          const message = new Uint8Array(err.response.data)
          throw new Error(prpc.PrpcError.decode(message).message)
        }

        throw err
      })

  // Generate a keypair for encryption
  // NOTE: each instance only has a pre-generated pair now, it maybe better to generate a new keypair every time encrypting
  const seed = hexToU8a(hexAddPrefix(randomHex(32)))
  const pair = sr25519KeypairFromSeed(seed)
  const [sk, pk] = [pair.slice(0, 64), pair.slice(64)]
  const iv = hexAddPrefix(randomHex(12))
  const queryAgreementKey = sr25519Agree(
    hexToU8a(hexAddPrefix(remotePubkey)),
    sk
  )
  const contractKey = (
    await api.query.phalaRegistry.contractKey(contractId)
  ).toString()
  const commandAgreementKey = sr25519Agree(hexToU8a(contractKey), sk)

  const createEncryptedData: CreateEncryptedData = (data, agreementKey) => ({
    iv,
    pubkey: u8aToHex(pk),
    data: hexAddPrefix(encrypt(data, agreementKey, hexToU8a(iv))),
  })

  const query: Query = async (encodedQuery, {certificate, pubkey, secret}) => {
    // Encrypt the ContractQuery.
    const encryptedData = createEncryptedData(encodedQuery, queryAgreementKey)
    const encodedEncryptedData = api
      .createType('EncryptedData', encryptedData)
      .toU8a()

    // Sign the encrypted data.
    const signature: pruntime_rpc.ISignature = {
      signed_by: certificate,
      signature_type: pruntime_rpc.SignatureType.Sr25519,
      signature: sr25519Sign(pubkey, secret, encodedEncryptedData),
    }

    // Send request.
    const requestData = {
      encoded_encrypted_data: encodedEncryptedData,
      signature,
    }
    return contractQuery(requestData).then((res) => {
      const encodedEncryptedData = res.data.encoded_encrypted_data
      const {data: encryptedData, iv} = api
        .createType('EncryptedData', encodedEncryptedData)
        .toJSON() as {
        iv: string
        data: string
      }
      const data = decrypt(encryptedData, queryAgreementKey, iv)
      return hexAddPrefix(data)
    })
  }

  const command: Command = ({contractId, payload}) => {
    const encodedPayload = api
      .createType('CommandPayload', {
        encrypted: createEncryptedData(payload, commandAgreementKey),
      })
      .toHex()

    return api.tx.phalaMq.pushMessage(
      stringToHex(`phala/contract/${hexStripPrefix(contractId)}/command`),
      encodedPayload
    )
  }

  Object.defineProperty(api.tx, 'contracts', {
    value: {
      instantiateWithCode: () => null,
      call: (dest: AccountId, value: any, gasLimit: any, data: Uint8Array) => {
        return command({
          contractId: dest.toHex(),
          payload: api
            .createType('InkCommand', {
              InkMessage: {
                nonce: hexAddPrefix(randomHex(32)),
                // FIXME: unexpected u8a prefix
                message: api.createType('Vec<u8>', data).toHex(),
              },
            })
            .toHex(),
        })
      },
    },
  })
  Object.defineProperty(api.rx.rpc, 'contracts', {
    value: {
      call: ({origin, dest, inputData}: ContractCallRequest) => {
        return from(
          query(
            api
              .createType('InkQuery', {
                head: {
                  nonce: hexAddPrefix(randomHex(32)),
                  id: dest,
                },
                data: {
                  InkMessage: inputData,
                },
              })
              .toHex(),
            origin as any as CertificateData
          ).then((data) => {
            return api.createType(
              'ContractExecResult',
              (
                api.createType('InkResponse', hexAddPrefix(data)).toJSON() as {
                  result: {ok: {inkMessageReturn: string}}
                }
              ).result.ok.inkMessageReturn
            )
          })
        )
      },
    },
  })

  return api
}
