'use client'

import { useRef, useState, useTransition } from 'react'
import { addComment, deleteComment } from './actions'

type Comment = {
  id: string
  author_id: string
  body: string
  created_at: string
  authorName: string
}

export function CommentSection({
  classId,
  progressLogId,
  comments,
  currentUserId,
}: {
  classId: string
  progressLogId: string
  comments: Comment[]
  currentUserId: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const { error } = await addComment(classId, progressLogId, formData)
      if (error) {
        setError(error)
        return
      }
      formRef.current?.reset()
    })
  }

  function handleDelete(commentId: string) {
    setError(null)
    setDeletingId(commentId)
    startTransition(async () => {
      const { error } = await deleteComment(classId, commentId)
      setDeletingId(null)
      if (error) {
        setError(error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <span className="text-xs text-ink">
                <span className="font-medium text-accent-text">{c.authorName}:</span> {c.body}
              </span>
              {c.author_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending && deletingId === c.id}
                  className="shrink-0 text-xs text-muted underline disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          name="body"
          maxLength={280}
          placeholder="Add a comment"
          className="flex-1 rounded-[2px] border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={isPending}
          className="btn shrink-0 rounded-[2px] bg-accent px-2 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          Post
        </button>
      </form>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
