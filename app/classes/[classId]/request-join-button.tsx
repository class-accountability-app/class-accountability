'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { requestToJoin } from './actions'

export function RequestJoinButton({ podId }: { podId: string }) {
  const t = useTranslations('pods')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      const result = await requestToJoin(podId)
      setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRequest}
        disabled={isPending}
        className="btn rounded-[2px] border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
      >
        {isPending ? tCommon('sending') : t('requestToJoin')}
      </button>
      <FormError error={error} />
    </div>
  )
}
