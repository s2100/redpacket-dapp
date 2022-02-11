import accountAtom from 'atoms/account'

import {useEffect, useState} from 'react'
import {FormEventHandler, useCallback, useRef} from 'react'

import {atomWithStorage} from 'jotai/utils'
import {useAtom} from 'jotai'

import {create, signCertificate, CertificateData} from '@phala/sdk'

import type {ApiPromise} from '@polkadot/api'
import {ContractPromise} from '@polkadot/api-contract'

import {MoneyCollectOutlined, RightOutlined} from '@ant-design/icons'

import {getSigner} from 'lib/polkadotExtension'
import contractMetadata from 'lib/redpacket.abi.json'
import {createApi} from 'lib/polkadotApi'

import {toaster} from 'baseui/toast'

const baseURL = '/'
const contractIdAtom = atomWithStorage<string>(
  'contractId',
  '0xcf4b9fd7eb64dc1fe5ca550e715a49fae9f5a2de88afd3c32daa137fcc8ca5b7'
)
const metadataStringAtom = atomWithStorage<string>(
  'metadataString',
  JSON.stringify(contractMetadata, null, 2)
)

const RedPacket: Page = () => {
  const [account] = useAtom(accountAtom)
  const [contractId, setContractId] = useAtom(contractIdAtom)
  const [metadataString, setMetadataString] = useAtom(metadataStringAtom)
  const [certificateData, setCertificateData] = useState<CertificateData>()
  const [api, setApi] = useState<ApiPromise>()
  const [contract, setContract] = useState<ContractPromise>()
  const unsubscribe = useRef<() => void>()

  const loadContract = async () => {
    try {
      const api = await createApi({
        endpoint: process.env.NEXT_PUBLIC_WS_ENDPOINT,
      })
      setApi(api)
      const flipContract = new ContractPromise(
        await create({api, baseURL, contractId}),
        JSON.parse(metadataString),
        contractId
      )
      setContract(flipContract)
      toaster.positive('Contract created', {})
    } catch (err) {
      toaster.negative((err as Error).message, {})
    }
  }

  useEffect(() => {
    const _unsubscribe = unsubscribe.current
    return () => {
      api?.disconnect()
      _unsubscribe?.()
    }
  }, [api])

  useEffect(() => {
    setCertificateData(undefined)
  }, [account])

  const onSignCertificate = useCallback(async () => {
    if (account && api) {
      try {
        const signer = await getSigner(account)

        // Save certificate data to state, or anywhere else you want like local storage
        setCertificateData(
          await signCertificate({
            api,
            account,
            signer,
          })
        )
        toaster.positive('Certificate signed', {})
      } catch (err) {
        toaster.negative((err as Error).message, {})
      }
    }
  }, [api, account])

  const onQuery = () => {
    if (!certificateData || !contract) return
    contract.query.get(certificateData as any as string, {}).then((res) => {
      toaster.info(JSON.stringify(res.output?.toHuman()), {})
    })
  }

  const onCommand = async () => {
    if (!contract || !account) return
    const signer = await getSigner(account)
    contract.tx.flip({}).signAndSend(account.address, {signer}, (status) => {
      if (status.isInBlock) {
        toaster.positive('In Block', {})
      }
    })
  }

  return (
    <div>
      <div className="redpacket-row">
        <div className="redpacket-col">
          <div className="redpacket-wrapper">
            <div className="redpacket">
              <div className="redpacket-balance-label">PHA Left</div>
              <div className="redpacket-balance">237.5</div>
              <div className="redpacket-desc">Get random red packet!</div>
              <button className="redpacket-get">
                <MoneyCollectOutlined />
                &nbsp; I&apos;m Lucky
              </button>
              <div className="redpacket-donate">
                <RightOutlined />
                Donate more PHA on this red packet!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

RedPacket.title = 'Red Packet'

export default RedPacket
