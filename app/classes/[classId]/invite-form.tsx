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
    return <p className="text-xs text-zinc-600 dark:text-zinc-400">No classmates left to invite.</p>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded border border-black/[.15] px-2 py-1.5 text-sm dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
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
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
