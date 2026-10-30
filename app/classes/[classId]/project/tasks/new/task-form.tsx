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

// The mockup's 進み具合のはかり方 as native radios drawn as segments (as in
// the target form): status only, a count with a unit, or characters.
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-owner`} className="text-sm font-semibold text-ink">
            {t('newTask.owner')}
          </label>
          <select id={`${id}-owner`} name="owner_id" defaultValue={defaultOwnerId} className={controlClass}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="">{t('newTask.ownerNone')}</option>
          </select>
        </div>

        <fieldset className="flex flex-col gap-1.5" aria-describedby={`${id}-how-hint`}>
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t('newTask.how')}</legend>
          <div className="flex overflow-hidden rounded-lg border border-[#747775]">
            {TASK_METRICS.map((m, i) => (
              <label
                key={m}
                className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center px-1.5 py-1.5 text-center text-sm leading-[1.4] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-accent ${
                  i > 0 ? 'border-l border-[#747775]' : ''
                } ${metric === m ? 'bg-ink text-surface' : 'bg-[#ffffff] text-ink'}`}
              >
                <input
                  type="radio"
                  name="metric"
                  value={m}
                  checked={metric === m}
                  onChange={() => {
                    setMetric(m)
                    setError(null)
                  }}
                  className="sr-only"
                />
                {t(`newTask.hows.${m}`)}
              </label>
            ))}
          </div>
          <p id={`${id}-how-hint`} className="text-[13px] leading-[1.7] text-muted">
            {t(`newTask.howHint.${metric}`)}
          </p>
        </fieldset>

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
      </div>

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('creating') : t('newTask.submit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
