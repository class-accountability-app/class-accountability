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

type Row = { id: string; label: string; tally: string; best: boolean }

// The vote grid (mockup view "vote"): one row per time, ○ △ ✕ as toggle
// buttons. A tap saves at once; the counts refresh from the server.
export function VoteGrid({
  classId,
  pollId,
  rows,
  mine,
}: {
  classId: string
  pollId: string
  rows: Row[]
  mine: Record<string, PollAnswer>
}) {
  const t = useTranslations('project')
  const router = useRouter()
  const [answers, setAnswers] = useState(mine)
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

  return (
    <div className="flex flex-col">
      <ul className="rule-card flex flex-col px-3.5 py-1.5" aria-busy={isPending}>
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex min-h-14 items-center justify-between gap-2.5 border-b border-dashed border-border py-1.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-[15px] leading-7 text-ink">{row.label}</p>
              <p className="font-meta text-xs leading-5 text-muted">
                {row.tally}
                {row.best && <span className="font-bold text-status-active"> · {t('vote.best')}</span>}
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
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-[2px] text-[17px] font-bold ${
                    answers[row.id] === a ? 'bg-ink text-white' : 'bg-[#fffdf7] text-ink shadow-[inset_0_0_0_1px_#b9a57c]'
                  }`}
                >
                  {MARK[a]}
                </button>
              ))}
            </div>
          </li>
        ))}
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
  options: { id: string; label: string }[]
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
        className="h-12 w-full rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-base text-ink"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
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
