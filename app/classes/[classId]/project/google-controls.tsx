'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { createGroupDoc, requestGoogleSync } from './google-actions'

// Opening the board asks for a re-count of the pod's linked files (the
// database allows one per student per 2 minutes). When one was asked for, the
// board refreshes once a few seconds later to show the new numbers.
const REFRESH_AFTER_MS = 8000

export function GoogleSyncOnOpen() {
  const router = useRouter()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    requestGoogleSync().then((queued) => {
      if (queued) timer = setTimeout(() => router.refresh(), REFRESH_AFTER_MS)
    })
    return () => clearTimeout(timer)
  }, [router])
  return null
}

export function CreateGroupDocButton({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('google')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled={isPending}
        className={`${secondaryButtonClass} w-full`}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await createGroupDoc(classId, projectId)
            if (result.error) {
              setError(result.error)
              return
            }
            router.refresh()
          })
        }
      >
        {isPending ? t('creating') : t('groupDocCreate')}
      </button>
      <FormError error={error} />
    </div>
  )
}
