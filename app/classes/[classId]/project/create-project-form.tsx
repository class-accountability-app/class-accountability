'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FieldError, FormError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { primaryButtonClass } from '@/components/buttons'
import { PROJECT_TEMPLATE_KEYS } from '@/lib/project-templates'
import { createProject } from './actions'

type Field = 'title' | 'deadline' | 'checkin_every'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  titleRequired: 'title',
  titleTooLong: 'title',
  deadlineInPast: 'deadline',
  checkinEveryInvalid: 'checkin_every',
}

export const controlClass =
  'h-12 w-full rounded-lg border border-[#747775] bg-[#ffffff] px-3.5 text-base text-ink placeholder:text-muted'

// Starting the pod's one project: a title, an optional deadline and how often
// everyone checks in (every 4 days unless changed, 1–14), and optionally a
// task template (lib/project-templates.ts) so the board starts with tasks.
export function CreateProjectForm({ classId }: { classId: string }) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const tTemplates = useTranslations('templates')
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
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
      const result = await createProject(classId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">
            {t('titleLabel')}
          </label>
          <input
            id={`${id}-title`}
            name="title"
            type="text"
            maxLength={120}
            placeholder={t('titlePlaceholder')}
            className={controlClass}
            {...describedField(fieldError('title'), `${id}-title-error`)}
          />
          <FieldError id={`${id}-title-error`} error={fieldError('title')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-deadline`} className="text-sm font-semibold text-ink">
            {t('deadlineLabel')}
          </label>
          <input
            id={`${id}-deadline`}
            name="deadline"
            type="date"
            className={controlClass}
            {...describedField(fieldError('deadline'), `${id}-deadline-error`)}
          />
          <FieldError id={`${id}-deadline-error`} error={fieldError('deadline')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-every`} className="text-sm font-semibold text-ink">
            {t('checkinLabel')}
          </label>
          <div className="flex items-center gap-2.5">
            <input
              id={`${id}-every`}
              name="checkin_every"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              defaultValue="4"
              className={`${controlClass} max-w-24`}
              {...describedField(fieldError('checkin_every'), `${id}-every-error`, `${id}-every-hint`)}
            />
            <span className="shrink-0 text-[15px] text-ink">{t('checkinSuffix')}</span>
          </div>
          <p id={`${id}-every-hint`} className="text-[13px] leading-[1.7] text-muted">
            {t('checkinHint')}
          </p>
          <FieldError id={`${id}-every-error`} error={fieldError('checkin_every')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-template`} className="text-sm font-semibold text-ink">
            {t('templateLabel')}
          </label>
          <select
            id={`${id}-template`}
            name="template"
            defaultValue=""
            aria-describedby={`${id}-template-hint`}
            className={controlClass}
          >
            <option value="">{t('templateNone')}</option>
            {PROJECT_TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {tTemplates(key)}
              </option>
            ))}
          </select>
          <p id={`${id}-template-hint`} className="text-[13px] leading-[1.7] text-muted">
            {t('templateHint')}
          </p>
        </div>
      </div>

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('creating') : t('startSubmit')}
      </button>
      <FormError error={errorField ? null : error} />
    </form>
  )
}
