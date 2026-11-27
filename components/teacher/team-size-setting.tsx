'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TEAM_SIZE_CHOICES } from '@/lib/team-size'
import { FieldError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { setTeamSizeLimit } from '@/app/classes/[classId]/organizer-actions'

// チームの人数の上限 (0053): the organizer picks the most students one team in
// this class may have, 2–10 (6 to start). Saving applies to joining by code,
// invitations and the organizer's own team tools. Lowering it removes nobody;
// `overCount` teams already above it are named as a number, never by name.
export function TeamSizeSetting({ classId, limit, overCount }: { classId: string; limit: number; overCount: number }) {
  const t = useTranslations('organizer')
  const id = useId()
  const router = useRouter()
  const [value, setValue] = useState(limit)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await setTeamSizeLimit(classId, value)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="rule-card flex w-full flex-col gap-3 px-5 py-5">
      <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-ink">
        {t('teamSizeHeading')}
      </h2>
      <p id={`${id}-hint`} className="text-[13px] leading-6 text-muted">
        {t('teamSizeHint')}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-ink">{t('teamSizeLabel')}</span>
          <select
            value={value}
            onChange={(e) => {
              setValue(Number(e.target.value))
              setSaved(false)
            }}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
            className="h-11 min-w-28 rounded-lg border border-outline bg-surface px-2.5 text-base text-ink"
          >
            {TEAM_SIZE_CHOICES.map((n) => (
              <option key={n} value={n}>
                {t('teamSizeOption', { n })}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={save} disabled={isPending || value === limit} className={secondaryButtonClass}>
          {t('teamSizeSave')}
        </button>
      </div>
      <FieldError id={`${id}-error`} error={error} />
      {saved && (
        <p role="status" className="text-[13px] text-status-active">
          {t('teamSizeSaved')}
        </p>
      )}
      {overCount > 0 && (
        <p className="rounded-lg bg-tint-hudson px-3 py-2 text-[13px] leading-6 text-ink">{t('teamSizeOver', { count: overCount })}</p>
      )}
    </section>
  )
}
