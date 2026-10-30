'use client'

import { useId, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { ErrorKey } from '@/lib/errors'
import { POLL_DURATIONS, POLL_MAX_OPTIONS, POLL_TITLE_MAX, VOTE_BY_DAYS } from '@/lib/meeting-poll'
import { addDaysYmd, formatDateWithWeekday, formatDayColumn } from '@/lib/date'
import { gridTimes, isPastSlot, slotKey, sortedKeys, splitSlotKey, weekBounds, weekDays } from '@/lib/poll-grid'
import { FieldError, FormError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { controlClass } from '../../create-project-form'
import { createPoll } from '../actions'

type Field = 'title' | 'slots' | 'vote_by'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  titleRequired: 'title',
  pollTitleTooLong: 'title',
  pollTimesTooFew: 'slots',
  pollTimesTooMany: 'slots',
  pollTimeInvalid: 'slots',
  pollTimePast: 'slots',
  pollTimeDuplicate: 'slots',
  voteByPast: 'vote_by',
}

type VoteByChoice = 'none' | `${(typeof VOTE_BY_DAYS)[number]}` | 'custom'

// The times are picked on a week grid (days across, times down; tap to add or
// remove), up to 20. A time off the grid can still be added by date and clock.
// 回答のしめきり is optional: none, 1 / 3 / 7 days from now, or any time.
export function PollForm({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [now] = useState(() => new Date())
  const bounds = useMemo(() => weekBounds(now), [now])
  const [monday, setMonday] = useState(bounds.first)
  const [step, setStep] = useState<30 | 60>(60)
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState<number>(POLL_DURATIONS[0])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [extraDate, setExtraDate] = useState('')
  const [extraTime, setExtraTime] = useState('')
  const [voteByChoice, setVoteByChoice] = useState<VoteByChoice>('none')
  const [voteBy, setVoteBy] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)
  const days = weekDays(monday)
  const times = gridTimes(step)
  const full = selected.size >= POLL_MAX_OPTIONS

  function toggle(key: string) {
    setError(null)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else if (next.size < POLL_MAX_OPTIONS) next.add(key)
      return next
    })
  }

  function addExtra() {
    if (!extraDate || !extraTime) {
      setError('pollTimeInvalid')
      return
    }
    const key = slotKey(extraDate, extraTime)
    if (isPastSlot(key, new Date())) {
      setError('pollTimePast')
      return
    }
    if (!selected.has(key)) toggle(key)
    setExtraDate('')
    setExtraTime('')
  }

  const slotLabel = (key: string) => {
    const { date, time } = splitSlotKey(key)
    return `${formatDateWithWeekday(date, locale)} ${time}`
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('titleRequired')
      return
    }
    startTransition(async () => {
      const result = await createPoll(classId, projectId, {
        title,
        duration,
        voteBy: voteByChoice === 'custom' ? voteBy || null : null,
        voteByDays: voteByChoice === 'none' || voteByChoice === 'custom' ? null : Number(voteByChoice),
        slots: sortedKeys(selected).map(splitSlotKey),
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/classes/${classId}/project/meetings/${result.id}`)
    })
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-[2px] border border-border bg-surface p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">
            {t('poll.titleLabel')}
          </label>
          <input
            id={`${id}-title`}
            type="text"
            value={title}
            maxLength={POLL_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('poll.titlePlaceholder')}
            className={controlClass}
            {...describedField(fieldError('title'), `${id}-title-error`)}
          />
          <FieldError id={`${id}-title-error`} error={fieldError('title')} />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t('poll.lengthLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {POLL_DURATIONS.map((d) => (
              <label
                key={d}
                className={`inline-flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-[2px] px-3.5 text-[15px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  duration === d ? 'bg-ink text-surface' : 'bg-[#fffdf7] text-ink shadow-[inset_0_0_0_1px_#b9a57c]'
                }`}
              >
                <input type="radio" name="duration" value={d} checked={duration === d} onChange={() => setDuration(d)} className="sr-only" />
                {t('poll.minutes', { count: d })}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2" {...describedField(fieldError('slots'), `${id}-slots-error`, `${id}-slots-hint`)}>
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t('poll.slotsLabel')}</legend>
          <p id={`${id}-slots-hint`} className="-mt-1 text-[13px] leading-[1.7] text-muted">
            {t('poll.gridHint')}
          </p>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={monday <= bounds.first}
              onClick={() => setMonday(addDaysYmd(monday, -7))}
              className={`${secondaryButtonClass} px-3`}
              aria-label={t('poll.prevWeek')}
            >
              ←
            </button>
            <p className="text-sm font-semibold text-ink" aria-live="polite">
              {t('poll.week', { from: formatDateWithWeekday(days[0], locale), to: formatDateWithWeekday(days[6], locale) })}
            </p>
            <button
              type="button"
              disabled={monday >= bounds.last}
              onClick={() => setMonday(addDaysYmd(monday, 7))}
              className={`${secondaryButtonClass} px-3`}
              aria-label={t('poll.nextWeek')}
            >
              →
            </button>
          </div>

          <label className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-ink">
            <input type="checkbox" checked={step === 30} onChange={(e) => setStep(e.target.checked ? 30 : 60)} className="h-5 w-5" />
            {t('poll.halfHours')}
          </label>

          <div className="max-h-[420px] overflow-y-auto rounded-[2px] border border-border">
            <table className="w-full table-fixed border-collapse text-center">
              <caption className="sr-only">{t('poll.gridCaption')}</caption>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <th scope="col" className="w-12" />
                  {days.map((d) => {
                    const head = formatDayColumn(d, locale)
                    return (
                      <th key={d} scope="col" className="py-1 text-[11px] leading-tight font-semibold text-muted">
                        <span className="block">{head.weekday}</span>
                        <span className="block text-sm text-ink">{head.day}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {times.map((time) => (
                  <tr key={time}>
                    <th scope="row" className="pr-1 text-right font-meta text-[11px] font-normal text-muted">
                      {time}
                    </th>
                    {days.map((d) => {
                      const key = slotKey(d, time)
                      const on = selected.has(key)
                      const past = isPastSlot(key, now)
                      return (
                        <td key={key} className="p-0.5">
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={slotLabel(key)}
                            disabled={past || (full && !on)}
                            onClick={() => toggle(key)}
                            className={`h-9 w-full rounded-[2px] text-xs font-bold ${
                              on
                                ? 'bg-accent text-white'
                                : past
                                  ? 'bg-transparent'
                                  : 'bg-[#fffdf7] shadow-[inset_0_0_0_1px_#e3d7bd] disabled:opacity-40'
                            }`}
                          >
                            {on ? '○' : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[13px] leading-7 text-muted" aria-live="polite">
            {t('poll.picked', { count: selected.size, max: POLL_MAX_OPTIONS })}
          </p>
          {selected.size > 0 && (
            <ul className="flex flex-wrap gap-2">
              {sortedKeys(selected).map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] bg-[#fffdf7] px-3 text-sm text-ink shadow-[inset_0_0_0_1px_#b9a57c]"
                    aria-label={t('poll.removeTime', { when: slotLabel(key) })}
                  >
                    {slotLabel(key)} <span aria-hidden>✕</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <details className="pt-1">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-text underline underline-offset-4">
              {t('poll.otherTime')}
            </summary>
            <div className="flex items-end gap-2 pt-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={`${id}-xd`} className="text-xs text-muted">
                  {t('poll.otherDate')}
                </label>
                <input id={`${id}-xd`} type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} className={controlClass} />
              </div>
              <div className="flex w-28 flex-col gap-1">
                <label htmlFor={`${id}-xt`} className="text-xs text-muted">
                  {t('poll.otherClock')}
                </label>
                <input id={`${id}-xt`} type="time" step={300} value={extraTime} onChange={(e) => setExtraTime(e.target.value)} className={controlClass} />
              </div>
              <button type="button" disabled={full} onClick={addExtra} className={`${secondaryButtonClass} h-12`}>
                {t('poll.otherAdd')}
              </button>
            </div>
          </details>
          <FieldError id={`${id}-slots-error`} error={fieldError('slots')} />
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t('poll.voteByLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['none', ...VOTE_BY_DAYS.map(String), 'custom'] as VoteByChoice[]).map((choice) => (
              <label
                key={choice}
                className={`inline-flex h-11 cursor-pointer items-center justify-center rounded-[2px] px-3.5 text-[15px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  voteByChoice === choice ? 'bg-ink text-surface' : 'bg-[#fffdf7] text-ink shadow-[inset_0_0_0_1px_#b9a57c]'
                }`}
              >
                <input
                  type="radio"
                  name="vote_by_choice"
                  value={choice}
                  checked={voteByChoice === choice}
                  onChange={() => setVoteByChoice(choice)}
                  className="sr-only"
                />
                {choice === 'none'
                  ? t('poll.voteByNone')
                  : choice === 'custom'
                    ? t('poll.voteByCustom')
                    : t('poll.voteByDays', { count: Number(choice) })}
              </label>
            ))}
          </div>
          {voteByChoice === 'custom' && (
            <div className="flex flex-col gap-1.5 pt-1">
              <label htmlFor={`${id}-by`} className="text-xs text-muted">
                {t('poll.voteByAt')}
              </label>
              <input
                id={`${id}-by`}
                type="datetime-local"
                value={voteBy}
                onChange={(e) => setVoteBy(e.target.value)}
                className={controlClass}
                {...describedField(fieldError('vote_by'), `${id}-by-error`)}
              />
            </div>
          )}
          <p className="text-[13px] leading-[1.7] text-muted">{t('poll.voteByHint')}</p>
          <FieldError id={`${id}-by-error`} error={fieldError('vote_by')} />
        </fieldset>
      </div>

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('creating') : t('poll.submit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
