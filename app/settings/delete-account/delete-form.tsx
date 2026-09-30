'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { isConfirmWord } from '@/lib/delete-account'
import { FieldError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { deleteAccount } from './actions'

// Type 「削除」 / "delete" to enable the button. On success the action signs
// out and redirects to the landing page, so there's no success state here.
export function DeleteAccountForm() {
  const t = useTranslations('deleteAccount')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [word, setWord] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()
  useFocusFirstInvalid(formRef, error)

  const fieldId = `${id}-confirm`
  const errorId = `${fieldId}-error`
  const ready = isConfirmWord(word)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!ready) {
      setError('confirmWordMismatch')
      return
    }
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await deleteAccount(formData)
      if (result?.error) setError(result.error)
    })
  }

  // The confirm word is the only field, so every error sits under it.
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-2.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
        {t('confirmLabel')}
      </label>
      <input
        id={fieldId}
        name="confirm"
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={word}
        onChange={(e) => {
          setWord(e.target.value)
          setError(null)
        }}
        className="h-12 min-w-0 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-base text-ink"
        {...describedField(error, errorId)}
      />
      <FieldError id={errorId} error={error} />
      <button
        type="submit"
        disabled={!ready || isPending}
        className="btn inline-flex min-h-12 items-center justify-center rounded-[2px] bg-accent px-4 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {isPending ? t('deleting') : t('submit')}
      </button>
    </form>
  )
}
