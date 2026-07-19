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
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3"
    >
      <input
        type="text"
        name="title"
        required
        placeholder="Target title"
        className="rounded border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
      />
      <select
        name="target_type"
        value={targetType}
        onChange={(e) => setTargetType(e.target.value)}
        className="rounded border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
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
          className="rounded border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
        />
      )}
      <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        Deadline (optional)
        <input
          type="date"
          name="deadline"
          className="rounded border border-black/[.15] px-3 py-2 text-sm text-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create target'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
