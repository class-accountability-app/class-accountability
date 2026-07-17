'use client'

import { useState, useTransition } from 'react'
import { acceptInvitation, declineInvitation } from './actions'

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const { error } = await acceptInvitation(invitationId)
      if (error) {
        setError(error)
      }
    })
  }

  function handleDecline() {
    setError(null)
    startTransition(async () => {
      const { error } = await declineInvitation(invitationId)
      if (error) {
        setError(error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending}
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? '…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={isPending}
          className="rounded border border-black/[.15] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50"
        >
          {isPending ? '…' : 'Decline'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
