'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FieldError, FormError, describedField } from '@/components/form-errors'
import { primaryButtonClass } from '@/components/buttons'
import { submitCheckin } from '../actions'

// The note and 仲間に共有する. Once shared, it goes to the check-in feed.
export function CheckinForm({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  const noteError = error === 'tooLong' ? error : null

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitCheckin(classId, projectId, note)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/classes/${classId}/project/checkins`)
    })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-semibold text-ink">
          {t('checkin.noteLabel')}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={4}
          placeholder={t('checkin.notePlaceholder')}
          className="w-full rounded-lg border border-[#747775] bg-[#ffffff] px-3.5 py-2 text-base leading-7 text-ink placeholder:text-muted"
          {...describedField(noteError, `${id}-note-error`, `${id}-fine`)}
        />
        <FieldError id={`${id}-note-error`} error={noteError} />
      </div>
      <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('sending') : t('checkin.send')}
      </button>
      <p id={`${id}-fine`} className="text-[13px] leading-7 text-muted">
        {t('checkin.fine')}
      </p>
      <FormError error={noteError ? null : error} />
    </form>
  )
}
