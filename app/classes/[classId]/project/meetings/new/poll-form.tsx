'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { POLL_DURATIONS, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_TITLE_MAX } from '@/lib/meeting-poll'
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

type Slot = { key: number; date: string; time: string }

// Each time is a date field and a time field (the phone's own pickers), both
// labelled. Rows can be added up to 8 and removed down to 2.
export function PollForm({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const nextKey = useRef(POLL_MIN_OPTIONS + 1)
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState<number>(POLL_DURATIONS[0])
  const [slots, setSlots] = useState<Slot[]>([
    { key: 0, date: '', time: '' },
    { key: 1, date: '', time: '' },
    { key: 2, date: '', time: '' },
  ])
  const [voteBy, setVoteBy] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)

  function update(key: number, part: 'date' | 'time', value: string) {
    setSlots((current) => current.map((s) => (s.key === key ? { ...s, [part]: value } : s)))
    setError(null)
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
        voteBy: voteBy || null,
        slots: slots.map(({ date, time }) => ({ date, time })),
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
            {t('poll.slotsHint')}
          </p>
          {slots.map((s, i) => (
            <div key={s.key} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={`${id}-d${s.key}`} className="text-xs text-muted">
                  {t('poll.slotDate', { n: i + 1 })}
                </label>
                <input
                  id={`${id}-d${s.key}`}
                  type="date"
                  value={s.date}
                  onChange={(e) => update(s.key, 'date', e.target.value)}
                  className={controlClass}
                />
              </div>
              <div className="flex w-28 flex-col gap-1">
                <label htmlFor={`${id}-t${s.key}`} className="text-xs text-muted">
                  {t('poll.slotTime', { n: i + 1 })}
                </label>
                <input
                  id={`${id}-t${s.key}`}
                  type="time"
                  step={300}
                  value={s.time}
                  onChange={(e) => update(s.key, 'time', e.target.value)}
                  className={controlClass}
                />
              </div>
              {slots.length > POLL_MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setSlots((current) => current.filter((x) => x.key !== s.key))}
                  className={`${secondaryButtonClass} h-12 w-12 px-0`}
                  aria-label={t('poll.removeSlot', { n: i + 1 })}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {slots.length < POLL_MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => setSlots((current) => [...current, { key: nextKey.current++, date: '', time: '' }])}
              className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4"
            >
              ＋ {t('poll.addSlot')}
            </button>
          )}
          <FieldError id={`${id}-slots-error`} error={fieldError('slots')} />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-by`} className="text-sm font-semibold text-ink">
            {t('poll.voteByLabel')}
          </label>
          <input
            id={`${id}-by`}
            type="datetime-local"
            value={voteBy}
            onChange={(e) => setVoteBy(e.target.value)}
            className={controlClass}
            {...describedField(fieldError('vote_by'), `${id}-by-error`)}
          />
          <FieldError id={`${id}-by-error`} error={fieldError('vote_by')} />
        </div>
      </div>

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('creating') : t('poll.submit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
