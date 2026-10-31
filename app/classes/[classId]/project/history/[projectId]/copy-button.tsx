'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { copyProject } from '../../actions'

// Start a new project with this one's tasks (no owners, no dates, not done).
export function CopyProjectButton({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('wrapUp')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <div className="flex flex-col gap-1.5 px-0.5">
      <p className="text-[13px] leading-6 text-muted">{t('copyHint')}</p>
      <button
        type="button"
        disabled={isPending}
        className={`${secondaryButtonClass} self-start`}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await copyProject(classId, projectId)
            if (result.error) {
              setError(result.error)
              return
            }
            router.push(`/classes/${classId}/project`)
          })
        }
      >
        {isPending ? tCommon('working') : t('copy')}
      </button>
      <FormError error={error} />
    </div>
  )
}
