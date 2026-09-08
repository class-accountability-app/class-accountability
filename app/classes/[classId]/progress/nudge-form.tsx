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
          className="text-xs font-medium text-accent-text underline underline-offset-2"
        >
          Nudge
        </button>
        {sent && <p className="text-xs text-muted">Nudge sent.</p>}
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
        className="rounded-[2px] border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-[2px] bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Sending…' : 'Send nudge'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setError(null)
          }}
          className="text-xs text-muted underline underline-offset-2"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  )
}
