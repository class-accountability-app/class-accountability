'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setOnlineSharing } from './actions'

// 設定's 「オンライン表示」 (0035): whether teammates see the live dot. The day
// of the last visit is shown either way (the privacy policy says so).
export function OnlineRow({ initialOn }: { initialOn: boolean }) {
  const t = useTranslations('settings.online')
  const id = useId()
  const [on, setOn] = useState(initialOn)
  const [failed, setFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const labelId = `${id}-label`
  const hintId = `${id}-hint`

  function toggle() {
    const next = !on
    setOn(next)
    setFailed(false)
    startTransition(async () => {
      const result = await setOnlineSharing(next)
      if (result.error) {
        setOn(!next)
        setFailed(true)
      }
    })
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
          aria-describedby={hintId}
          aria-busy={isPending}
          disabled={isPending}
          onClick={toggle}
          className={`relative h-8 w-[52px] shrink-0 rounded-full border disabled:opacity-50 ${
            on ? 'border-[#0b57d0] bg-[#0b57d0]' : 'border-[#747775] bg-[#e1e3e1]'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-[3px] h-6 w-6 rounded-full border border-[#747775] bg-[#ffffff] ${
              on ? 'left-[23px]' : 'left-[3px]'
            }`}
          />
        </button>
      </div>
      <p role="status" className="text-[13px] leading-[1.7] text-muted empty:hidden [&:not(:empty)]:mt-2">
        {failed ? t('failed') : null}
      </p>
    </div>
  )
}
