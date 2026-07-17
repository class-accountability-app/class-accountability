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
        className="rounded border border-black/[.15] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50"
      >
        {isPending ? 'Requesting…' : 'Request to join'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
