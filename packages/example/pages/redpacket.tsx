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
  '0x8b2a2317544507a21bfb395420e6e00b2902ce1329e3446da05882d0fcd07660'
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
      let endpoint = process.env.NEXT_PUBLIC_WS_ENDPOINT
      const api = await createApi({
        endpoint: endpoint,
      })
      setApi(api)
      const redPacketContract = new ContractPromise(
        await create({api, baseURL, contractId}),
        JSON.parse(metadataString),
        contractId
      )
      setContract(redPacketContract)
      toaster.positive('Contract Initialized', {})
    } catch (err) {
      toaster.negative((err as Error).message, {})
    }
  }

  useEffect(() => {
    loadContract()
  }, [])

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
    console.log('onSignCertificate')
    if (account && api) {
      console.log('certificateData', certificateData)
      if (certificateData) {
        toaster.positive('Certificate already signed', {})
      } else {
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
    }
  }, [api, account, certificateData])

  const getBalance = () => {
    console.log('getBalance')
    if (!certificateData || !contract) return
    contract.query.get(certificateData as any as string, {}).then((res) => {
      toaster.info(JSON.stringify(res.output?.toHuman()), {})
    })
  }

  const getRedPacket = async () => {
    console.log('getRedPacket')
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
              <div className="redpacket-balance" onClick={getBalance}>
                237.5
              </div>
              <div className="redpacket-desc" onClick={onSignCertificate}>
                Click to Sign Certificate
              </div>
              <button className="redpacket-get" onClick={getRedPacket}>
                <MoneyCollectOutlined />
                &nbsp; lucky me
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
