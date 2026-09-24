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
import { logProgress } from './actions'

type TargetType = 'task' | 'word_count' | 'study_hours' | 'character_count'

type Field = 'target_id' | 'progress_value' | 'description'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  chooseTarget: 'target_id',
  notOwnTarget: 'target_id',
  progressPositive: 'progress_value',
  tooLong: 'description',
}

const controlClass =
  'rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted'

export function LogProgressForm({
  classId,
  targets,
}: {
  classId: string
  targets: { id: string; title: string; target_type: TargetType }[]
}) {
  const t = useTranslations('logForm')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [selectedId, setSelectedId] = useState(targets[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  if (targets.length === 0) {
    return <p className="text-sm text-muted">{t('needTarget')}</p>
  }

  const selectedType = targets.find((target) => target.id === selectedId)?.target_type ?? 'task'
  const isHours = selectedType === 'study_hours'
  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)
  const ids = { target: `${id}-target`, value: `${id}-value`, note: `${id}-note` }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await logProgress(classId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
      setSelectedId(targets[0]?.id ?? '')
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.target} className="text-sm font-medium text-ink">
          {t('targetLabel')}
        </label>
        <select
          id={ids.target}
          name="target_id"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={controlClass}
          {...describedField(fieldError('target_id'), `${ids.target}-error`)}
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.title}
            </option>
          ))}
        </select>
        <FieldError id={`${ids.target}-error`} error={fieldError('target_id')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.value} className="text-sm font-medium text-ink">
          {t(`valueLabel.${selectedType}`)}
        </label>
        <input
          id={ids.value}
          type="number"
          name="progress_value"
          min={isHours ? '0.01' : '1'}
          step={isHours ? 'any' : '1'}
          inputMode={isHours ? 'decimal' : 'numeric'}
          placeholder={t(`valuePlaceholder.${selectedType}`)}
          className={controlClass}
          {...describedField(fieldError('progress_value'), `${ids.value}-error`)}
        />
        <FieldError id={`${ids.value}-error`} error={fieldError('progress_value')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.note} className="text-sm font-medium text-ink">
          {t('noteLabel')}
        </label>
        <textarea
          id={ids.note}
          name="description"
          maxLength={280}
          rows={2}
          placeholder={t('notePlaceholder')}
          className={controlClass}
          {...describedField(fieldError('description'), `${ids.note}-error`)}
        />
        <FieldError id={`${ids.note}-error`} error={fieldError('description')} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="btn rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? t('logging') : t('submit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
