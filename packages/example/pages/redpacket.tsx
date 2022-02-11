import {useEffect, useState} from 'react'
import {FormEventHandler, useCallback, useRef} from 'react'
import type {ApiPromise} from '@polkadot/api'
import {
  create as createPhala,
  randomHex,
  signCertificate,
  CertificateData,
  PhalaInstance,
} from '@phala/sdk'
import {MoneyCollectOutlined, RightOutlined} from '@ant-design/icons'
import {enablePolkadotExtension} from 'lib/polkadotExtension'
import {createApi} from 'lib/polkadotApi'
import {useAtom} from 'jotai'
import accountAtom from 'atoms/account'
import {getSigner} from 'lib/polkadotExtension'
import {toaster} from 'baseui/toast'
import {numberToHex, hexAddPrefix, u8aToHex} from '@polkadot/util'

const baseURL = '/'

const RedPacket = ({api, phala}: {api: ApiPromise; phala: PhalaInstance}) => {
  const [account] = useAtom(accountAtom)
  const [number, setNumber] = useState('')
  const [certificateData, setCertificateData] = useState<CertificateData>()
  const [signCertificateLoading, setSignCertificateLoading] = useState(false)
  const [guessLoading, setGuessLoading] = useState(false)
  const [owner, setOwner] = useState('')
  const unsubscribe = useRef<() => void>()

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
    if (account) {
      setSignCertificateLoading(true)
      try {
        const signer = await getSigner(account)
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
      setSignCertificateLoading(false)
    }
  }, [api, account])

  const onGuess = useCallback<FormEventHandler<HTMLFormElement>>(
    (e) => {
      e.preventDefault()
      if (!certificateData) return
      setGuessLoading(true)
      const encodedQuery = api
        .createType('GuessNumberRequest', {
          head: {
            id: numberToHex(CONTRACT_ID, 256),
            nonce: hexAddPrefix(randomHex(32)),
          },
          data: {
            guess: {
              guess_number: Number(number),
            },
          },
        })
        .toHex()

      phala
        .query(encodedQuery, certificateData)
        .then((data: any) => {
          const {
            result: {ok, err},
          } = api
            .createType('GuessNumberResponse', hexAddPrefix(data))
            .toJSON() as any

          if (ok) {
            const {guessResult} = ok
            if (guessResult === 'Correct') {
              toaster.positive('Correct!', {})
              setNumber('')
            } else {
              toaster.info(guessResult, {})
            }
          }

          if (err) {
            throw new Error(err)
          }
        })
        .catch((err: Error) => {
          toaster.negative((err as Error).message, {})
        })
        .finally(() => {
          setGuessLoading(false)
        })
    },
    [phala, api, number, certificateData]
  )

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
