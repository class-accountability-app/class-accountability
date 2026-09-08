'use client'

import { useRef, useState, useTransition } from 'react'
import { createTarget } from './actions'

export function TargetForm({ classId }: { classId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [targetType, setTargetType] = useState('task')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const { error } = await createTarget(classId, formData)
      if (error) {
        setError(error)
        return
      }
      formRef.current?.reset()
      setTargetType('task')
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <input
        type="text"
        name="title"
        required
        placeholder="Target title"
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink placeholder:text-muted"
      />
      <select
        name="target_type"
        value={targetType}
        onChange={(e) => setTargetType(e.target.value)}
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink"
      >
        <option value="task">Task</option>
        <option value="word_count">Word count</option>
        <option value="study_hours">Study hours</option>
      </select>
      {targetType !== 'task' && (
        <input
          type="number"
          name="target_amount"
          min="1"
          step="any"
          required
          placeholder={targetType === 'word_count' ? 'Target word count' : 'Target hours'}
          className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink placeholder:text-muted"
        />
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Deadline (optional)
        <input
          type="date"
          name="deadline"
          className="rounded-[2px] border border-border bg-surface px-3 py-3 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create target'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
