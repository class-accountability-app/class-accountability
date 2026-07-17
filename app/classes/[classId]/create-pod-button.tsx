'use client'

import { useState, useTransition } from 'react'
import { createPod } from './actions'

export function CreatePodButton({ classId }: { classId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const { error } = await createPod(classId)
      if (error) {
        setError(error)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create a pod'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
