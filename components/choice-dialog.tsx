'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// A modal <dialog> that asks for a choice (Prompt 12: the editor's conflict
// and unsaved-draft questions, the sign-out warning). showModal makes the
// page behind it inert and keeps focus inside. Without onCancel, Escape does
// nothing: closing would leave the text undecided. With it, Escape means
// cancel.
export function ChoiceDialog({
  open,
  labelledBy,
  onCancel,
  children,
}: {
  open: boolean
  labelledBy: string
  onCancel?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault()
        onCancel?.()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[2px] bg-surface p-5 text-ink shadow-[inset_0_0_0_1px_var(--border)] backdrop:bg-ink/40"
    >
      {open && children}
    </dialog>
  )
}
