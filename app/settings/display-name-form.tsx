'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { normalizeDisplayName } from '@/lib/display-name'
import { FieldError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { updateDisplayName } from './actions'

export function DisplayNameForm({ currentName, emailNoteId }: { currentName: string; emailNoteId: string }) {
  const t = useTranslations('settings')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [saved, setSaved] = useState(false)
  useFocusFirstInvalid(formRef, error)

  const fieldId = `${id}-name`
  const errorId = `${fieldId}-error`

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    const checked = normalizeDisplayName(formData.get('display_name'))
    if (checked.error) {
      setError(checked.error)
      return
    }

    startTransition(async () => {
      const result = await updateDisplayName(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-2.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
        {t('nameLabel')}
      </label>
      <div className="flex gap-2">
        <input
          id={fieldId}
          name="display_name"
          type="text"
          autoComplete="nickname"
          defaultValue={currentName}
          onChange={() => setSaved(false)}
          className="h-12 min-w-0 flex-1 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-ink"
          {...describedField(error, errorId, emailNoteId)}
        />
        <button
          type="submit"
          disabled={isPending}
          className="btn inline-flex min-h-12 shrink-0 items-center justify-center rounded-[2px] bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
      <FieldError id={errorId} error={error} />
      <p role="status" className="text-[13px] text-muted empty:hidden">
        {saved ? t('saved') : ''}
      </p>
    </form>
  )
}
