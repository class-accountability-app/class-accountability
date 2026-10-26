'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { disconnectGoogle } from '@/app/classes/[classId]/project/google-actions'

// 設定 → Google: connected or not, and 連携を解除 (revokes at Google and deletes
// the stored, encrypted token; files I linked then show "can't read" until a
// podmate relinks). Connecting starts from a project's board, where there is
// a file to link.
export function GoogleRow({ connected }: { connected: boolean }) {
  const t = useTranslations('google')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[15px] leading-7 text-ink">{connected ? t('settingsConnected') : t('settingsNotConnected')}</p>
      <p className="text-[13px] leading-[1.7] text-muted">{connected ? t('settingsConnectedHint') : t('settingsNotConnectedHint')}</p>
      {connected && (
        <button
          type="button"
          disabled={isPending}
          className={`${secondaryButtonClass} self-start`}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await disconnectGoogle()
              if (result.error) setError(result.error)
              router.refresh()
            })
          }
        >
          {isPending ? tCommon('working') : t('disconnect')}
        </button>
      )}
      <FormError error={error} />
    </div>
  )
}
