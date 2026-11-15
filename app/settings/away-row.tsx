'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { setAway } from './actions'

// 設定's 「お休みを伝える」 (0049): one date, shown to my team on チームのようす
// as 「○日までお休み」. No reason is asked. It ends by itself after that day.
export function AwayRow({
  initialUntil,
  initialLabel,
  min,
  max,
}: {
  // My current break ('YYYY-MM-DD'), or null. Already over = null.
  initialUntil: string | null
  // The same day, formatted on the server (lib/date.ts).
  initialLabel: string | null
  min: string
  max: string
}) {
  const t = useTranslations('settings.away')
  const id = useId()
  const [until, setUntil] = useState(initialUntil ?? '')
  const [saved, setSaved] = useState(initialUntil !== null)
  const [message, setMessage] = useState<'saved' | 'cleared' | null>(null)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  const send = (value: string | null) =>
    startTransition(async () => {
      setError(null)
      setMessage(null)
      const result = await setAway(value)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(value !== null)
      if (value === null) setUntil('')
      setMessage(value === null ? 'cleared' : 'saved')
    })

  return (
    <div className="flex flex-col gap-2 py-3">
      <label htmlFor={id} className="text-[15px] font-semibold text-ink">
        {t('label')}
      </label>
      <p id={`${id}-hint`} className="text-[13px] leading-[1.6] text-muted">
        {t('hint')}
      </p>
      {saved && initialLabel && until === initialUntil && (
        <p className="text-sm leading-7 text-ink">{t('current', { date: initialLabel })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          type="date"
          value={until}
          min={min}
          max={max}
          onChange={(e) => {
            setUntil(e.target.value)
            setMessage(null)
          }}
          aria-describedby={`${id}-hint`}
          className="h-11 min-w-0 flex-1 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
        />
        <button
          type="button"
          disabled={isPending || until === ''}
          className={`${secondaryButtonClass} h-11 px-4 text-sm`}
          onClick={() => send(until)}
        >
          {t('set')}
        </button>
        {saved && (
          <button type="button" disabled={isPending} className={`${secondaryButtonClass} h-11 px-4 text-sm`} onClick={() => send(null)}>
            {t('clear')}
          </button>
        )}
      </div>
      <FormError error={error} />
      <p role="status" className="text-[13px] leading-[1.7] text-muted empty:hidden">
        {message ? t(message) : null}
      </p>
    </div>
  )
}
