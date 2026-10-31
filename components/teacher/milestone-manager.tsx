'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { ErrorKey } from '@/lib/errors'
import { formatDate } from '@/lib/date'
import { MILESTONE_TITLE_MAX, isMilestoneInput } from '@/lib/planning'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass } from '@/components/buttons'
import { addMilestone, deleteMilestone } from '@/app/classes/[classId]/organizer-actions'

export type MilestoneStatus = {
  milestone_id: string
  title: string
  due: string
  target_percent: number
  teams: number
  reached: number
}

// 目安 (0038): the organizer's checkpoints ("by 11/20, 30% done"). Every team
// sees the next one on its board; here the organizer sees how many teams have
// reached each, never which ones.
export function MilestoneManager({ classId, milestones }: { classId: string; milestones: MilestoneStatus[] }) {
  const t = useTranslations('planning')
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const id = useId()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [percent, setPercent] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()
  const ok = isMilestoneInput(title, due, Number(percent))

  function run(action: () => Promise<{ error: ErrorKey | null }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  const field = 'h-11 rounded-lg border border-outline bg-surface px-3 text-base text-ink'

  return (
    <section aria-labelledby={`${id}-heading`} className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-ink">
        {t('milestonesHeading')}
      </h2>
      <p className="text-[13px] leading-6 text-muted">{t('milestonesWhy')}</p>
      {milestones.length > 0 && (
        <ul className="flex flex-col">
          {milestones.map((m) => (
            <li key={m.milestone_id} className="flex items-center justify-between gap-2 border-t border-dashed border-border py-2">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{m.title}</p>
                <p className="font-meta text-xs text-muted">
                  {t('milestoneLine', { date: formatDate(m.due, locale), percent: m.target_percent })} ·{' '}
                  {t('milestoneReached', { reached: m.reached, teams: m.teams })}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => deleteMilestone(classId, m.milestone_id))}
                className="inline-flex min-h-11 shrink-0 items-center text-[13px] text-muted underline underline-offset-4"
              >
                {t('milestoneDelete')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">
        {t('milestoneTitleLabel')}
      </label>
      <input
        id={`${id}-title`}
        value={title}
        maxLength={MILESTONE_TITLE_MAX}
        placeholder={t('milestoneTitleExample')}
        onChange={(e) => setTitle(e.target.value)}
        className={field}
      />
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${id}-due`} className="text-sm font-semibold text-ink">
            {t('milestoneDueLabel')}
          </label>
          <input id={`${id}-due`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <label htmlFor={`${id}-percent`} className="text-sm font-semibold text-ink">
            {t('milestonePercentLabel')}
          </label>
          <input
            id={`${id}-percent`}
            inputMode="numeric"
            value={percent}
            onChange={(e) => setPercent(e.target.value.replace(/[^0-9]/g, ''))}
            className={field}
          />
        </div>
      </div>
      <FormError error={error} />
      <button
        type="button"
        disabled={isPending || !ok}
        className={`${primaryButtonClass} self-start`}
        onClick={() =>
          run(
            () => addMilestone(classId, title, due, Number(percent)),
            () => {
              setTitle('')
              setDue('')
              setPercent('')
            }
          )
        }
      >
        {isPending ? tCommon('working') : t('milestoneAdd')}
      </button>
    </section>
  )
}
