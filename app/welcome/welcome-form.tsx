'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { normalizeDisplayName } from '@/lib/display-name'
import { FieldError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { StatusStamp } from '@/components/status-stamp'
import { chooseDisplayName } from '../settings/actions'

export function WelcomeForm({ currentName, next }: { currentName: string; next: string }) {
  const t = useTranslations('welcome')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setName] = useState(currentName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const fieldId = `${id}-name`
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const preview = name.trim() || currentName

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const checked = normalizeDisplayName(formData.get('display_name'))
    if (checked.error) {
      setError(checked.error)
      return
    }

    startTransition(async () => {
      // On success the action redirects to `next`, so only errors come back.
      const result = await chooseDisplayName(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="mt-2 flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
          {t('label')}
        </label>
        <input
          id={fieldId}
          name="display_name"
          type="text"
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 w-full rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-ink"
          {...describedField(error, errorId, hintId)}
        />
        <FieldError id={errorId} error={error} />
        <p id={hintId} className="text-[13px] text-muted">
          {t('hint')}
        </p>
      </div>

      {/* Live preview: the same stamp and name style as a pod card. */}
      <div className="rounded-[2px] border border-border bg-surface p-4">
        <p className="mb-2.5 font-meta text-xs text-muted">{t('previewHeading')}</p>
        <div className="flex items-center gap-2.5">
          <StatusStamp status="active" />
          <span className="min-w-0 font-heading text-[17px] font-bold text-ink [overflow-wrap:anywhere]">
            {preview}
          </span>
          <span className="ml-auto shrink-0 font-meta text-xs text-muted">{t('previewStatus')}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="btn mt-3 flex h-[52px] w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white disabled:opacity-50"
      >
        {isPending ? t('saving') : t('submit')}
      </button>
    </form>
  )
}
