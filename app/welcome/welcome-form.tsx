'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { normalizeDisplayName } from '@/lib/display-name'
import { FieldError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { chooseNameAndJoin } from './actions'

// `joining`: the page is a class invitation, so the button also joins.
export function WelcomeForm({
  currentName,
  next,
  joining,
}: {
  currentName: string
  next: string
  joining: boolean
}) {
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
      // On success the action redirects (to the pod step, or to `next`), so
      // only errors come back.
      const result = await chooseNameAndJoin(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-3.5">
        {joining && <p className="text-[13px] leading-7 text-muted">{t('note')}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="btn flex h-[52px] w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white disabled:opacity-50"
        >
          {isPending ? (joining ? t('joining') : t('saving')) : joining ? t('join') : t('submit')}
        </button>
      </div>
    </form>
  )
}
