'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { emptyActionClass } from '@/components/empty-state'
import { turnOnPush, usePushDevice } from '@/components/push'
import { INSTALL_ROW_ID } from '@/app/settings/install-row'

// The one-time offer on 声かけ (after mockup 08), shown once a nudge has
// arrived, while this device can receive pushes and doesn't yet. 「あとで」
// hides it for good on this device: push is per device, so the dismissal is
// too. It lives in localStorage, not a cookie or the database, so it never
// leaves the phone. If storage is cleared, the card comes back once.
const DISMISSED_KEY = 'sp-push-card-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Private mode: the card simply shows again next time.
  }
}

export function PushCard() {
  const t = useTranslations('nudgesPage.pushCard')
  const tSettings = useTranslations('settings.push')
  const [device, setDevice] = usePushDevice()
  // Nothing renders until the device check is done, so reading storage here
  // can't make the server and browser disagree.
  const [dismissed, setDismissed] = useState(() => typeof window === 'undefined' || readDismissed())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!device || device.on || dismissed) return null
  if (device.state !== 'available' && device.state !== 'ios-install-first') return null

  async function turnOn() {
    setFailed(false)
    // First thing in the tap: iOS shows the permission prompt only then.
    const pending = turnOnPush()
    setBusy(true)
    const result = await pending
    setBusy(false)
    if (result === 'on') setDevice({ state: 'available', on: true })
    else if (result === 'denied') setDevice({ state: 'denied', on: false })
    else if (result === 'failed') setFailed(true)
  }

  function later() {
    saveDismissed()
    setDismissed(true)
  }

  return (
    <section
      aria-labelledby="push-card-title"
      className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-[18px]"
    >
      <h2 id="push-card-title" className="font-heading text-xl leading-[1.45] font-bold text-ink">
        {t('title')}
      </h2>
      <p className="text-sm leading-[1.8] text-ink">{t('body')}</p>

      {device.state === 'ios-install-first' && (
        <div className="rounded-[2px] border border-[#e3d4b0] bg-[#fffdf7] px-4 py-3 text-sm leading-[1.8]">
          <p className="font-semibold text-ink">{t('iosTitle')}</p>
          <Link
            href={`/settings#${INSTALL_ROW_ID}`}
            className="text-accent-text underline underline-offset-4"
          >
            {t('iosLink')}
          </Link>
        </div>
      )}

      {device.state === 'available' && (
        <button type="button" onClick={() => void turnOn()} disabled={busy} className={`${emptyActionClass} disabled:opacity-50`}>
          {t('turnOn')}
        </button>
      )}
      <button
        type="button"
        onClick={later}
        className="flex min-h-12 w-full items-center justify-center rounded-[2px] border border-border bg-[#fffdf7] text-[15px] font-semibold text-ink"
      >
        {t('later')}
      </button>

      <p role="status" className="text-[13px] leading-[1.7] text-muted">
        {failed ? tSettings('failed') : t('footnote')}
      </p>
    </section>
  )
}
