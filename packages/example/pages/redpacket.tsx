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
  '0x2353dee3e8662fde73aafd487ab49146bfeb8128a177bafa988633b312baeffc'
)

const RedPacket: Page = () => {
  const [account] = useAtom(accountAtom)
  const [contractId, setContractId] = useAtom(contractIdAtom)
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
      const redpacketContract = new ContractPromise(
        await create({api, baseURL, contractId}),
        contractMetadata,
        contractId
      )
      setContract(redpacketContract)
      toaster.positive('Contract loaded', {})
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
    if (account && api) {
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
    if (!certificateData || !contract) return
    console.log('contract', contract)
    console.log('contract.query', contract.query)
    contract.query.get(certificateData as any as string, {}).then((res) => {
      toaster.info(JSON.stringify(res.output?.toHuman()), {})
    })
  }

  const getRedPacket = async () => {
    console.log('getRedPacket')
    if (!contract || !account) return
    const signer = await getSigner(account)
    contract.tx
      .redpacket({})
      .signAndSend(account.address, {signer}, (status) => {
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
