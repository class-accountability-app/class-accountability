'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { leavePod } from './actions'

// ポッドを抜ける, with the same in-place confirm as 削除 in あなたの最近の記録:
// focus goes to やめる (the safe choice), Escape backs out, and backing out
// returns focus to ポッドを抜ける.
export function LeavePodButton({ classId, podId }: { classId: string; podId: string }) {
  const t = useTranslations('pods')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()
  const leaveRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (wasConfirming.current) leaveRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  function handleLeave() {
    setError(null)
    startTransition(async () => {
      const result = await leavePod(classId, podId)
      if (result.error) setError(result.error)
      // On success the page re-renders without this pod, and this unmounts.
    })
  }

  if (!confirming) {
    return (
      <div className="border-t border-dashed border-border pt-3">
        <button
          ref={leaveRef}
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 text-[15px] text-muted underline underline-offset-4"
        >
          {t('leavePod')}
        </button>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-labelledby={`leave-confirm-${podId}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isPending) setConfirming(false)
      }}
      className="flex flex-col gap-2 rounded-[2px] border border-accent-text bg-page-bg p-3"
    >
      <p id={`leave-confirm-${podId}`} className="text-sm text-ink">
        {t('leaveConfirm')}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLeave}
          disabled={isPending}
          className="btn inline-flex h-11 items-center rounded-[2px] bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? t('leaving') : t('leaveYes')}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="inline-flex h-11 items-center rounded-[2px] border border-ink bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-50"
        >
          {t('leaveNo')}
        </button>
      </div>
      <FormError error={error} />
    </div>
  )
}
