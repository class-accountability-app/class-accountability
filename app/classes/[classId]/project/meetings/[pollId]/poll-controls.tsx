'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { POLL_ANSWERS, type PollAnswer } from '@/lib/meeting-poll'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { answerPoll, cancelPoll, confirmPoll } from '../actions'

const MARK: Record<PollAnswer, string> = { yes: '○', maybe: '△', no: '✕' }

export type VoteRow = {
  id: string
  label: string
  tally: string
  best: boolean
  everyone: boolean
  // Names by answer, already joined for this language; '' when nobody.
  yes: string
  maybe: string
  no: string
  unanswered: string
  // Counts for the bar.
  counts: { yes: number; maybe: number; no: number; unanswered: number }
}

const WHO: { key: 'yes' | 'maybe' | 'no' | 'unanswered'; mark: string; label: 'whoYes' | 'whoMaybe' | 'whoNo' | 'whoUnanswered' }[] = [
  { key: 'yes', mark: '○', label: 'whoYes' },
  { key: 'maybe', mark: '△', label: 'whoMaybe' },
  { key: 'no', mark: '✕', label: 'whoNo' },
  { key: 'unanswered', mark: '–', label: 'whoUnanswered' },
]

// The bar under a time: ○ △ ✕ and not-yet, in that order. Decoration only;
// the names under it say the same in words.
const BAR: Record<'yes' | 'maybe' | 'no' | 'unanswered', string> = {
  yes: 'bg-status-active',
  maybe: 'bg-tint-olive',
  no: 'bg-tint-hudson shadow-[inset_0_0_0_1px_var(--ink)]',
  unanswered: 'bg-surface-container',
}

// The vote grid (mockup view "vote"): one block per time with ○ △ ✕ as toggle
// buttons (a tap saves at once), a bar of the answers and who gave each one
// (2026-11-15: names, not only counts). 日時順 or おすすめ順.
export function VoteGrid({
  classId,
  pollId,
  rows,
  rankedIds,
  mine,
}: {
  classId: string
  pollId: string
  // In calendar order.
  rows: VoteRow[]
  // The same times, best first (rankOptions in lib/meeting-poll.ts).
  rankedIds: string[]
  mine: Record<string, PollAnswer>
}) {
  const t = useTranslations('project')
  const router = useRouter()
  const sortId = useId()
  const [answers, setAnswers] = useState(mine)
  const [order, setOrder] = useState<'date' | 'best'>('date')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  function choose(optionId: string, answer: PollAnswer) {
    const previous = answers[optionId]
    setAnswers({ ...answers, [optionId]: answer })
    setError(null)
    startTransition(async () => {
      const result = await answerPoll(classId, pollId, optionId, answer)
      if (result.error) {
        setAnswers((current) => {
          const next = { ...current }
          if (previous) next[optionId] = previous
          else delete next[optionId]
          return next
        })
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  const shown = order === 'date' ? rows : rankedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 px-0.5">
        <label htmlFor={sortId} className="text-sm font-semibold text-ink">
          {t('vote.sortLabel')}
        </label>
        <select
          id={sortId}
          value={order}
          onChange={(e) => setOrder(e.target.value === 'best' ? 'best' : 'date')}
          className="h-11 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
        >
          <option value="date">{t('vote.sortDate')}</option>
          <option value="best">{t('vote.sortBest')}</option>
        </select>
      </div>
      <ul className="rule-card flex flex-col px-3.5 py-1.5" aria-busy={isPending}>
        {shown.map((row) => {
          const total = row.counts.yes + row.counts.maybe + row.counts.no + row.counts.unanswered
          return (
            <li key={row.id} className="flex flex-col gap-1.5 border-b border-dashed border-ink/15 py-2.5 last:border-b-0">
              <div className="flex min-h-11 items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <p className="text-[15px] leading-7 font-semibold text-ink">{row.label}</p>
                  <p className="flex flex-wrap items-center gap-x-2 font-meta text-xs leading-5 text-muted">
                    <span>{row.tally}</span>
                    {row.everyone && (
                      <span className="rounded-lg bg-tint-olive px-2 font-bold text-ink">{t('vote.everyone')}</span>
                    )}
                    {row.best && !row.everyone && <span className="font-bold text-status-active">{t('vote.best')}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5" role="group" aria-label={row.label}>
                  {POLL_ANSWERS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={answers[row.id] === a}
                      aria-label={t(`vote.answers.${a}`)}
                      onClick={() => choose(row.id, a)}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-[17px] font-bold ${
                        answers[row.id] === a ? 'bg-ink text-white' : 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--outline)]'
                      }`}
                    >
                      {MARK[a]}
                    </button>
                  ))}
                </div>
              </div>
              {total > 0 && (
                <div aria-hidden className="flex h-2.5 w-full overflow-hidden rounded-full">
                  {WHO.map(({ key }) =>
                    row.counts[key] > 0 ? (
                      <span key={key} className={BAR[key]} style={{ width: `${(row.counts[key] / total) * 100}%` }} />
                    ) : null
                  )}
                </div>
              )}
              <ul className="flex flex-col">
                {WHO.map(({ key, mark, label }) =>
                  row[key] ? (
                    <li key={key} className="flex gap-2 text-[13px] leading-6 text-ink [overflow-wrap:anywhere]">
                      <span aria-hidden className="w-4 shrink-0 text-center font-bold">
                        {mark}
                      </span>
                      <span className={key === 'unanswered' ? 'text-muted' : undefined}>{t(`vote.${label}`, { names: row[key] })}</span>
                    </li>
                  ) : null
                )}
              </ul>
            </li>
          )
        })}
      </ul>
      <FormError error={error} />
    </div>
  )
}

// Pick the meeting time: the best time is preselected, any time can be chosen.
export function ConfirmPoll({
  classId,
  pollId,
  options,
  defaultOptionId,
}: {
  classId: string
  pollId: string
  // `cost` says who the time leaves out (or that everyone can come).
  options: { id: string; label: string; cost: string; everyone: boolean }[]
  defaultOptionId: string | null
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const [choice, setChoice] = useState(defaultOptionId ?? options[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await confirmPoll(classId, pollId, choice)
          if (result.error) {
            setError(result.error)
            return
          }
          router.refresh()
        })
      }}
    >
      <label htmlFor={`${id}-choice`} className="text-sm font-semibold text-ink">
        {t('vote.chooseLabel')}
      </label>
      <select
        id={`${id}-choice`}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="h-12 w-full rounded-lg border border-outline bg-surface px-3.5 text-base text-ink"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Who this time leaves out, before it is fixed. */}
      {options
        .filter((o) => o.id === choice)
        .map((o) => (
          <p
            key={o.id}
            role="status"
            className={`rounded-lg px-3 py-2 text-sm leading-7 text-ink [overflow-wrap:anywhere] ${o.everyone ? 'bg-tint-olive' : 'bg-tint-hudson'}`}
          >
            {o.cost}
          </p>
        ))}
      <button type="submit" disabled={isPending || !choice} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('working') : t('vote.confirm')}
      </button>
      <FormError error={error} />
    </form>
  )
}

export function CancelPoll({ classId, pollId, label }: { classId: string; pollId: string; label: string }) {
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        disabled={isPending}
        className={secondaryButtonClass}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await cancelPoll(classId, pollId)
            if (result.error) setError(result.error)
            router.refresh()
          })
        }
      >
        {isPending ? tCommon('working') : label}
      </button>
      <FormError error={error} />
    </div>
  )
}
