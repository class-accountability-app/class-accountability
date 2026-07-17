'use client'

import { useState, useTransition } from 'react'
import { joinClass } from './actions'

export function JoinButton({ classId }: { classId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleJoin() {
    setError(null)
    startTransition(async () => {
      const { error } = await joinClass(classId)
      if (error) {
        setError(error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleJoin}
        disabled={isPending}
        className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {isPending ? 'Joining…' : 'Join'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
