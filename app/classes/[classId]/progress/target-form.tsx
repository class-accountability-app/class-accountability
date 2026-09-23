'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import {
  FieldError,
  FormError,
  describedField,
  useFocusFirstInvalid,
} from '@/components/form-errors'
import { createTarget } from './actions'

const TARGET_TYPES = ['task', 'word_count', 'study_hours', 'character_count'] as const
type TargetType = (typeof TARGET_TYPES)[number]

type Field = 'title' | 'target_type' | 'target_amount'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  titleRequired: 'title',
  invalidTargetType: 'target_type',
  targetAmountPositive: 'target_amount',
}

const controlClass =
  'rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted'

export function TargetForm({ classId }: { classId: string }) {
  const t = useTranslations('targetForm')
  const tCommon = useTranslations('common')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [targetType, setTargetType] = useState<TargetType>('task')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)
  const ids = {
    title: `${id}-title`,
    type: `${id}-type`,
    amount: `${id}-amount`,
    deadline: `${id}-deadline`,
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    if (!formData.get('title')?.toString().trim()) {
      setError('titleRequired')
      return
    }

    startTransition(async () => {
      const result = await createTarget(classId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
      setTargetType('task')
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.title} className="text-sm font-medium text-ink">
          {t('titleLabel')}
        </label>
        <input
          id={ids.title}
          type="text"
          name="title"
          placeholder={t('titlePlaceholder')}
          className={controlClass}
          {...describedField(fieldError('title'), `${ids.title}-error`)}
        />
        <FieldError id={`${ids.title}-error`} error={fieldError('title')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.type} className="text-sm font-medium text-ink">
          {t('typeLabel')}
        </label>
        <select
          id={ids.type}
          name="target_type"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as TargetType)}
          className={controlClass}
          {...describedField(fieldError('target_type'), `${ids.type}-error`)}
        >
          {TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </select>
        <FieldError id={`${ids.type}-error`} error={fieldError('target_type')} />
      </div>

      {targetType !== 'task' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.amount} className="text-sm font-medium text-ink">
            {t(`amountLabel.${targetType}`)}
          </label>
          <input
            id={ids.amount}
            type="number"
            name="target_amount"
            min={targetType === 'study_hours' ? '0.1' : '1'}
            step={targetType === 'study_hours' ? 'any' : '1'}
            inputMode={targetType === 'study_hours' ? 'decimal' : 'numeric'}
            placeholder={t(`amountPlaceholder.${targetType}`)}
            className={controlClass}
            {...describedField(fieldError('target_amount'), `${ids.amount}-error`)}
          />
          <FieldError id={`${ids.amount}-error`} error={fieldError('target_amount')} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.deadline} className="text-sm font-medium text-ink">
          {t('deadlineLabel')}
        </label>
        <input id={ids.deadline} type="date" name="deadline" className={controlClass} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="btn rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? tCommon('creating') : t('submit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
