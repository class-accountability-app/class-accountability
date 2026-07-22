'use client'

import { useRef, useState, useTransition } from 'react'
import { sendNudge } from './actions'

export function NudgeForm({ podId, toUserId }: { podId: string; toUserId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const content = formData.get('content')?.toString().trim() ?? ''

    if (!content) {
      setError("Say something before sending — the box can't be empty.")
      return
    }
    if (content.length > 280) {
      setError('Keep it to 280 characters or fewer.')
      return
    }

    startTransition(async () => {
      const { error } = await sendNudge(podId, toUserId, formData)
      if (error) {
        setError(error)
        return
      }
      formRef.current?.reset()
      setIsOpen(false)
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    })
  }

  if (!isOpen) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => {
            setSent(false)
            setIsOpen(true)
          }}
          className="text-xs font-medium text-black underline dark:text-zinc-50"
        >
          Nudge
        </button>
        {sent && <p className="text-xs text-zinc-600 dark:text-zinc-400">Nudge sent.</p>}
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        name="content"
        maxLength={280}
        rows={2}
        placeholder="How's it going — anything you're stuck on?"
        className="rounded border border-black/[.15] px-2 py-1 text-xs dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-foreground px-2 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {isPending ? 'Sending…' : 'Send nudge'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setError(null)
          }}
          className="text-xs text-zinc-600 underline dark:text-zinc-400"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
