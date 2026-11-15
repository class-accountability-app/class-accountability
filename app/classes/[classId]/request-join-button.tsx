'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
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
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleRequest}
        disabled={isPending}
        className={`${secondaryButtonClass} h-11 self-start px-4 text-sm`}
      >
        {isPending ? tCommon('sending') : t('requestToJoin')}
      </button>
      <p className="text-[13px] leading-6 text-muted">{t('requestHint')}</p>
      <FormError error={error} />
    </div>
  )
}
