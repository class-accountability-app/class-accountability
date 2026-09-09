'use client'

import { useState, useTransition } from 'react'
import { sendInvite } from './actions'

export function InviteForm({
  podId,
  eligibleClassmates,
}: {
  podId: string
  eligibleClassmates: { id: string; displayName: string }[]
}) {
  const [selectedId, setSelectedId] = useState(eligibleClassmates[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (eligibleClassmates.length === 0) {
    return <p className="text-xs text-muted">No classmates left to invite.</p>
  }

  function handleInvite() {
    if (!selectedId) return
    setError(null)
    startTransition(async () => {
      const { error } = await sendInvite(podId, selectedId)
      if (error) {
        setError(error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1 border-t border-dashed border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-[2px] border border-border bg-surface px-2 py-2 text-sm text-ink"
        >
          {eligibleClassmates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleInvite}
          disabled={isPending}
          className="btn rounded-[2px] bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
