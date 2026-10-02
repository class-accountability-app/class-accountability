'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { turnOffPush, turnOnPush, usePushDevice } from '@/components/push'
import { INSTALL_ROW_ID } from './install-row'

// 設定's 「声かけの通知」 switch (mockup 13) for this device. On asks for
// permission from the tap, subscribes and saves the row; off deletes the row
// and unsubscribes. Shown off and disabled until the browser has been
// checked, so it never flashes on.
export function PushRow() {
  const t = useTranslations('settings.push')
  const id = useId()
  const [device, setDevice] = usePushDevice()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const messageId = `${id}-message`
  const on = device?.on ?? false
  const usable = device?.state === 'available'

  async function toggle() {
    if (!device || busy) return
    setFailed(false)

    if (on) {
      setBusy(true)
      const ok = await turnOffPush()
      setBusy(false)
      if (ok) setDevice({ state: 'available', on: false })
      else setFailed(true)
      return
    }

    // First thing in the tap: iOS shows the permission prompt only then.
    const pending = turnOnPush()
    setBusy(true)
    const result = await pending
    setBusy(false)
    if (result === 'on') setDevice({ state: 'available', on: true })
    else if (result === 'denied') setDevice({ state: 'denied', on: false })
    else if (result === 'failed') setFailed(true)
  }

  let message: React.ReactNode = null
  if (failed) {
    message = t('failed')
  } else if (device?.state === 'ios-install-first') {
    message = (
      <>
        {t('iosInstallFirst')}{' '}
        <a href={`#${INSTALL_ROW_ID}`} className="text-accent-text underline underline-offset-4">
          {t('iosInstallLink')}
        </a>
      </>
    )
  } else if (device?.state === 'denied') {
    message = t('denied')
  } else if (device?.state === 'unsupported') {
    message = t('unsupported')
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div id={labelId} className="text-[15px] font-semibold text-ink">
            {t('label')}
          </div>
          <div id={hintId} className="mt-0.5 text-[13px] leading-[1.6] text-muted">
            {t('hint')}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={message ? `${hintId} ${messageId}` : hintId}
          aria-busy={device === null || busy}
          disabled={!usable || busy}
          onClick={() => void toggle()}
          className={`relative h-8 w-[52px] shrink-0 rounded-full border disabled:opacity-50 ${
            on ? 'border-[#5b7a52] bg-[#5b7a52]' : 'border-[#b9a57c] bg-[#e9dcc0]'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-[3px] h-6 w-6 rounded-full border border-[#b9a57c] bg-[#fbf6ea] ${
              on ? 'left-[23px]' : 'left-[3px]'
            }`}
          />
        </button>
      </div>
      <p id={messageId} role="status" className="text-[13px] leading-[1.7] text-muted empty:hidden [&:not(:empty)]:mt-2">
        {message}
      </p>
    </div>
  )
}
