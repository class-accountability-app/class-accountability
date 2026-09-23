'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { acceptInvitation, declineInvitation } from './actions'

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const t = useTranslations('pods')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<ErrorKey | null>(null)

  function run(action: 'accept' | 'decline') {
    setError(null)
    setPendingAction(action)
    startTransition(async () => {
      const result =
        action === 'accept'
          ? await acceptInvitation(invitationId)
          : await declineInvitation(invitationId)
      setError(result.error)
      setPendingAction(null)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run('accept')}
          disabled={isPending}
          className="btn rounded-[2px] bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending && pendingAction === 'accept' ? tCommon('working') : t('accept')}
        </button>
        <button
          type="button"
          onClick={() => run('decline')}
          disabled={isPending}
          className="btn rounded-[2px] border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          {isPending && pendingAction === 'decline' ? tCommon('working') : t('decline')}
        </button>
      </div>
      <FormError error={error} />
    </div>
  )
}
