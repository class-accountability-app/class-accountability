'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FieldError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { sendInvite } from './actions'

export function InviteForm({
  podId,
  eligibleClassmates,
}: {
  podId: string
  eligibleClassmates: { id: string; displayName: string }[]
}) {
  const t = useTranslations('pods')
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState(eligibleClassmates[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(containerRef, error)

  if (eligibleClassmates.length === 0) {
    return <p className="text-xs text-muted">{t('noOneToInvite')}</p>
  }

  const selectId = `${id}-invitee`
  const errorId = `${selectId}-error`

  function handleInvite() {
    if (!selectedId) return
    setError(null)
    startTransition(async () => {
      const result = await sendInvite(podId, selectedId)
      setError(result.error)
    })
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {t('inviteLabel')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={selectId}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-[2px] border border-border bg-surface px-2 py-2 text-ink"
          {...describedField(error, errorId)}
        >
          {eligibleClassmates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleInvite}
          disabled={isPending}
          className="btn rounded-[2px] bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? t('inviting') : t('invite')}
        </button>
      </div>
      <FieldError id={errorId} error={error} />
    </div>
  )
}
