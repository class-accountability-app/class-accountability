'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { joinClass } from './actions'

export function JoinButton({ classId }: { classId: string }) {
  const t = useTranslations('classes')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  function handleJoin() {
    setError(null)
    startTransition(async () => {
      const result = await joinClass(classId)
      setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleJoin}
        disabled={isPending}
        className="btn rounded-[2px] bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? t('joining') : t('join')}
      </button>
      <FormError error={error} />
    </div>
  )
}
