'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TASK_METRICS, type TaskMetric } from '@/lib/tasks'
import { FieldError, FormError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { primaryButtonClass } from '@/components/buttons'
import { addTask } from '../../actions'
import { controlClass } from '../../create-project-form'

type Field = 'title' | 'unit' | 'target_amount'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  titleRequired: 'title',
  titleTooLong: 'title',
  unitRequired: 'unit',
  unitTooLong: 'unit',
  targetAmountPositive: 'target_amount',
}

// 新しいタスク in three steps: what and who (the owner as pills), how it's
// measured (status only, a count with a unit, or characters, as option cards),
// then the goal and due day.
export function TaskForm({
  classId,
  projectId,
  members,
  defaultOwnerId,
}: {
  classId: string
  projectId: string
  members: { id: string; name: string }[]
  defaultOwnerId: string
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [metric, setMetric] = useState<TaskMetric>('count')
  // Characters tasks: written in Study Pods (counted by itself) unless the team writes elsewhere.
  const [writeHere, setWriteHere] = useState(true)
  const [owner, setOwner] = useState(defaultOwnerId)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    if (!formData.get('title')?.toString().trim()) {
      setError('titleRequired')
      return
    }
    startTransition(async () => {
      const result = await addTask(classId, projectId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/classes/${classId}/project`)
    })
  }

  // One option card: a native radio drawn as a card (selected on Penna, as
  // in どこで書きますか), with its title and a line saying what it means.
  const optionClass = (selected: boolean) =>
    `flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ink ${
      selected ? 'bg-tint-penna' : 'bg-surface shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-container'
    }`
  const step = (n: number, label: string, headingId: string) => (
    <h2 id={headingId} className="flex items-center gap-2.5 font-heading text-[17px] leading-7 font-bold text-ink">
      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink font-meta text-[13px] text-page-bg">
        {n}
      </span>
      {label}
    </h2>
  )

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5">
      {/* Soft pastel (2026-11-08): three steps, each its own card. */}
      <section aria-labelledby={`${id}-step1`} className="rule-card flex flex-col gap-5 px-5 py-5">
        {step(1, t('newTask.stepWhat'), `${id}-step1`)}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">
            {t('newTask.name')}
          </label>
          <input
            id={`${id}-title`}
            name="title"
            type="text"
            maxLength={120}
            placeholder={t('newTask.namePlaceholder')}
            className={controlClass}
            {...describedField(fieldError('title'), `${id}-title-error`)}
          />
          <FieldError id={`${id}-title-error`} error={fieldError('title')} />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t('newTask.owner')}</legend>
          <div className="flex flex-wrap gap-2">
            {[...members, { id: '', name: t('newTask.ownerNone') }].map((m) => (
              <label
                key={m.id || 'none'}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ink [overflow-wrap:anywhere] ${
                  owner === m.id ? 'bg-ink text-surface' : 'bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-surface-container'
                }`}
              >
                <input
                  type="radio"
                  name="owner_id"
                  value={m.id}
                  checked={owner === m.id}
                  onChange={() => setOwner(m.id)}
                  className="sr-only"
                />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby={`${id}-step2`} className="rule-card flex flex-col gap-5 px-5 py-5">
        {step(2, t('newTask.how'), `${id}-step2`)}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('newTask.how')}</legend>
          {TASK_METRICS.map((m) => (
            <label key={m} className={optionClass(metric === m)}>
              <input
                type="radio"
                name="metric"
                value={m}
                checked={metric === m}
                onChange={() => {
                  setMetric(m)
                  setError(null)
                }}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
              />
              <span className="flex flex-col">
                <span className="text-[15px] leading-6 font-semibold text-ink">{t(`newTask.hows.${m}`)}</span>
                <span className="text-[13px] leading-6 text-ink">{t(`newTask.howHint.${m}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {metric === 'characters' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold text-ink">{t('newTask.where')}</legend>
            <input type="hidden" name="input_mode" value={writeHere ? 'document' : 'manual'} />
            {([true, false] as const).map((here) => (
              <label key={String(here)} className={optionClass(writeHere === here)}>
                <input
                  type="radio"
                  name="write_where"
                  checked={writeHere === here}
                  onChange={() => setWriteHere(here)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
                />
                <span className="flex flex-col">
                  <span className="text-[15px] leading-6 font-semibold text-ink">{t(here ? 'newTask.whereHere' : 'newTask.whereElsewhere')}</span>
                  <span className="text-[13px] leading-6 text-ink">{t(here ? 'newTask.whereHereHint' : 'newTask.whereElsewhereHint')}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {metric === 'count' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-unit`} className="text-sm font-semibold text-ink">
              {t('newTask.unit')}
            </label>
            <input
              id={`${id}-unit`}
              name="unit"
              type="text"
              maxLength={20}
              placeholder={t('newTask.unitPlaceholder')}
              className={controlClass}
              {...describedField(fieldError('unit'), `${id}-unit-error`)}
            />
            <FieldError id={`${id}-unit-error`} error={fieldError('unit')} />
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-step3`} className="rule-card flex flex-col gap-5 px-5 py-5">
        {step(3, t('newTask.stepGoal'), `${id}-step3`)}
        {metric !== 'status' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-goal`} className="text-sm font-semibold text-ink">
              {t('newTask.goal')}
            </label>
            <input
              id={`${id}-goal`}
              name="target_amount"
              // Text with a number keyboard (see the target form): a number
              // field changes when the page scrolls under the pointer.
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={metric === 'characters' ? '2400' : '10'}
              className={controlClass}
              {...describedField(fieldError('target_amount'), `${id}-goal-error`)}
            />
            <FieldError id={`${id}-goal-error`} error={fieldError('target_amount')} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-due`} className="text-sm font-semibold text-ink">
            {t('newTask.due')}
          </label>
          <input id={`${id}-due`} name="due" type="date" className={controlClass} />
        </div>
      </section>

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} w-full`}>
        {isPending ? tCommon('creating') : t('newTask.submit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
