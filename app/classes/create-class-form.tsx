'use client'

import { useRef, useState, useTransition } from 'react'
import { createClass } from './actions'

export function CreateClassForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const { error } = await createClass(formData)
      if (error) {
        setError(error)
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex w-full max-w-xs flex-col gap-3"
    >
      <input
        type="text"
        name="name"
        required
        placeholder="Class name"
        className="rounded border border-black/[.15] px-3 py-2 dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
      />
      <input
        type="text"
        name="university"
        required
        placeholder="University"
        className="rounded border border-black/[.15] px-3 py-2 dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
      />
      <input
        type="text"
        name="term"
        required
        placeholder="Term (e.g. 2026-Fall)"
        className="rounded border border-black/[.15] px-3 py-2 dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create class'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
