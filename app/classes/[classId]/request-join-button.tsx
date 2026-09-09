'use client'

import { useState, useTransition } from 'react'
import { requestToJoin } from './actions'

export function RequestJoinButton({ podId }: { podId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      const { error } = await requestToJoin(podId)
      if (error) {
        setError(error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRequest}
        disabled={isPending}
        className="btn rounded-[2px] border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
      >
        {isPending ? 'Requesting…' : 'Request to join'}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
