'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { MEETING_NOTE_MAX } from '@/lib/planning'
import { FieldError, describedField } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { saveMeetingNote } from '@/app/classes/[classId]/project/planning-actions'

// 打ち合わせのメモ (0038): one shared note per meeting (what was decided, who
// does what next). Any team member edits it; the last save wins.
export function MeetingNotes({
  classId,
  pollId,
  initial,
  updatedLine,
}: {
  classId: string
  pollId: string
  initial: string
  updatedLine: string | null
}) {
  const t = useTranslations('planning')
  const tCommon = useTranslations('common')
  const id = useId()
  const [body, setBody] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <section aria-labelledby={`${id}-heading`} className="rule-card flex flex-col gap-2 px-3.5 py-3.5">
      <h2 id={`${id}-heading`} className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">
        {t('notesHeading')}
      </h2>
      <label htmlFor={`${id}-body`} className="text-sm font-semibold text-ink">
        {t('notesLabel')}
      </label>
      <textarea
        id={`${id}-body`}
        value={body}
        maxLength={MEETING_NOTE_MAX}
        rows={5}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-lg border border-outline bg-surface px-3 py-2 text-base leading-7 text-ink"
        {...describedField(error, `${id}-error`, `${id}-hint`)}
      />
      <p id={`${id}-hint`} className="text-[13px] leading-6 text-muted">
        {t('notesHint', { max: MEETING_NOTE_MAX })}
        {updatedLine && ` · ${updatedLine}`}
      </p>
      <FieldError id={`${id}-error`} error={error} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || body === saved}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const result = await saveMeetingNote(classId, pollId, body)
              if (result.error) setError(result.error)
              else setSaved(body)
            })
          }}
          className={secondaryButtonClass}
        >
          {isPending ? tCommon('working') : t('notesSave')}
        </button>
        {body === saved && saved !== initial && (
          <span role="status" className="text-[13px] text-status-active">
            {t('notesSaved')}
          </span>
        )}
      </div>
    </section>
  )
}
