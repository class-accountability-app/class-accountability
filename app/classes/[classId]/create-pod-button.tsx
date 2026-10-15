'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { emptyActionClass } from '@/components/empty-state'
import { createPod } from './actions'

// `block` is the full-width version used as an empty state's action;
// `buttonClassName` lets 次にやること use the shared primary look;
// `goTo` is where to go once the pod exists (the first-run flow's next step).
export function CreatePodButton({
  classId,
  block = false,
  buttonClassName,
  goTo,
}: {
  classId: string
  block?: boolean
  buttonClassName?: string
  goTo?: string
}) {
  const router = useRouter()
  const t = useTranslations('pods')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const result = await createPod(classId)
      setError(result.error)
      if (!result.error && goTo) router.push(goTo)
    })
  }

  return (
    <div className={`flex flex-col gap-1 ${block ? 'items-stretch' : 'items-start'}`}>
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className={
          buttonClassName ??
          (block
            ? `${emptyActionClass} disabled:opacity-50`
            : 'btn rounded-[2px] bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50')
        }
      >
        {isPending ? tCommon('creating') : t('createPod')}
      </button>
      <FormError error={error} />
    </div>
  )
}
