'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { ErrorKey } from '@/lib/errors'
import { ANNOUNCEMENT_MAX } from '@/lib/organizer'
import { formatDateTime } from '@/lib/date'
import { FieldError, describedField } from '@/components/form-errors'
import { primaryButtonClass } from '@/components/buttons'
import { deleteAnnouncement, postAnnouncement } from '@/app/classes/[classId]/organizer-actions'

export type Announcement = { id: string; body: string; created_at: string }

// クラスへのお知らせ (0036): the organizer posts short messages that every
// student in the class sees on their board and the class page.
export function AnnouncementManager({ classId, announcements }: { classId: string; announcements: Announcement[] }) {
  const t = useTranslations('organizer')
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const id = useId()
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ error: ErrorKey | null }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-ink">
        {t('announceHeading')}
      </h2>
      <label htmlFor={`${id}-body`} className="text-sm font-semibold text-ink">
        {t('announceLabel')}
      </label>
      <textarea
        id={`${id}-body`}
        value={body}
        maxLength={ANNOUNCEMENT_MAX}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-lg border border-[#747775] bg-[#ffffff] px-3 py-2 text-base text-ink"
        {...describedField(error, `${id}-error`, `${id}-hint`)}
      />
      <p id={`${id}-hint`} className="text-[13px] text-muted">
        {t('announceHint', { max: ANNOUNCEMENT_MAX })}
      </p>
      <FieldError id={`${id}-error`} error={error} />
      <button
        type="button"
        disabled={isPending || body.trim() === ''}
        className={`${primaryButtonClass} self-start`}
        onClick={() => run(() => postAnnouncement(classId, body), () => setBody(''))}
      >
        {isPending ? tCommon('working') : t('announceSend')}
      </button>
      {announcements.length > 0 && (
        <ul className="flex flex-col">
          {announcements.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 border-t border-dashed border-[#c4c7c5] py-2">
              <p className="font-meta text-xs text-muted">{formatDateTime(a.created_at, locale)}</p>
              <p className="text-[15px] leading-[1.7] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{a.body}</p>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => deleteAnnouncement(classId, a.id))}
                className="inline-flex min-h-11 items-center self-start text-[13px] text-muted underline underline-offset-4"
              >
                {t('announceDelete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
