'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FieldError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { emptyActionClass } from '@/components/empty-state'
import { sendNudge } from './actions'

// `block` shows the closed state as a full-width button (an empty state's action).
export function NudgeForm({
  podId,
  toUserId,
  block = false,
}: {
  podId: string
  toUserId: string
  block?: boolean
}) {
  const t = useTranslations('nudges')
  const tCommon = useTranslations('common')
  const id = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const fieldId = `${id}-message`
  const errorId = `${fieldId}-error`

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const content = formData.get('content')?.toString().trim() ?? ''

    if (!content) {
      setError('nudgeEmpty')
      return
    }
    if (content.length > 280) {
      setError('tooLong')
      return
    }

    startTransition(async () => {
      const result = await sendNudge(podId, toUserId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
      setIsOpen(false)
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    })
  }

  if (!isOpen) {
    return (
      <div className={`flex flex-col gap-1 ${block ? 'items-stretch' : 'items-start'}`}>
        <button
          type="button"
          onClick={() => {
            setSent(false)
            setIsOpen(true)
          }}
          className={
            block
              ? emptyActionClass
              : 'min-h-11 text-xs font-medium text-accent-text underline underline-offset-2'
          }
        >
          {t('open')}
        </button>
        <p role="status" className="text-xs text-muted">
          {sent ? t('sent') : ''}
        </p>
      </div>
    )
  }

  return (
    // w-full makes the open form wrap onto its own line under the name
    // (the card's header row is flex-wrap), instead of widening the row.
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-2 text-left">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {t('messageLabel')}
      </label>
      <textarea
        id={fieldId}
        name="content"
        maxLength={280}
        rows={2}
        placeholder={t('messagePlaceholder')}
        className="w-full rounded-[2px] border border-border bg-surface px-2 py-1.5 text-ink placeholder:text-muted"
        {...describedField(error, errorId)}
      />
      <FieldError id={errorId} error={error} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="btn rounded-[2px] bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {isPending ? tCommon('sending') : t('submit')}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setError(null)
          }}
          className="text-xs text-muted underline underline-offset-2"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </form>
  )
}
