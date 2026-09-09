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
          className="btn rounded-[2px] bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? '…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={isPending}
          className="btn rounded-[2px] border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          {isPending ? '…' : 'Decline'}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
