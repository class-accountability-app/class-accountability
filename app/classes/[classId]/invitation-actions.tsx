'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { acceptInvitation, declineInvitation } from './actions'

// Two uses, two sets of words (2026-11-15): an invitation to me ('invite':
// 「このチームに入る」) or someone asking to join my team ('request':
// 「チームに入れる」). Both buttons say what happens, and a line under them
// says it again.
export function InvitationActions({ invitationId, kind }: { invitationId: string; kind: 'invite' | 'request' }) {
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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run('accept')}
          disabled={isPending}
          className={`${primaryButtonClass} h-11 px-4 text-sm`}
        >
          {isPending && pendingAction === 'accept' ? tCommon('working') : t(kind === 'invite' ? 'acceptInvite' : 'acceptRequest')}
        </button>
        <button
          type="button"
          onClick={() => run('decline')}
          disabled={isPending}
          className={`${secondaryButtonClass} h-11 px-4 text-sm`}
        >
          {isPending && pendingAction === 'decline' ? tCommon('working') : t('decline')}
        </button>
      </div>
      <p className="text-[13px] leading-6 text-muted">{t(kind === 'invite' ? 'acceptInviteHint' : 'acceptRequestHint')}</p>
      <FormError error={error} />
    </div>
  )
}
