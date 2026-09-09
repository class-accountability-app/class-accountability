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
    <form ref={formRef} onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <input
        type="text"
        name="name"
        required
        placeholder="Class name"
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted"
      />
      <input
        type="text"
        name="university"
        required
        placeholder="University"
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted"
      />
      <input
        type="text"
        name="term"
        required
        placeholder="Term (e.g. 2026-Fall)"
        className="rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={isPending}
        className="btn rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create class'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
