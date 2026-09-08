'use client'

import { useRef, useState, useTransition } from 'react'
import { logProgress } from './actions'

export function LogProgressForm({
  classId,
  targets,
}: {
  classId: string
  targets: { id: string; title: string; target_type: string }[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (targets.length === 0) {
    return <p className="text-sm text-muted">Create a target above before logging progress.</p>
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const { error } = await logProgress(classId, formData)
      if (error) {
        setError(error)
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <select
        name="target_id"
        required
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink"
      >
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <input
        type="number"
        name="progress_value"
        min="0.01"
        step="any"
        required
        placeholder="Progress value (e.g. words written, hours studied, 1 for done)"
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink placeholder:text-muted"
      />
      <textarea
        name="description"
        maxLength={280}
        rows={2}
        placeholder="What did you do? (optional, ≤280 chars)"
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? 'Logging…' : 'Log progress'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
