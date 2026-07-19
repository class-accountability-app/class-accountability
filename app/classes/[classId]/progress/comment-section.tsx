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
    <div className="flex flex-col gap-2 border-l border-black/[.1] pl-3 dark:border-white/[.15]">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">{c.authorName}:</span> {c.body}
              </span>
              {c.author_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending && deletingId === c.id}
                  className="shrink-0 text-xs text-zinc-500 underline disabled:opacity-50 dark:text-zinc-400"
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
          className="flex-1 rounded border border-black/[.15] px-2 py-1 text-xs dark:border-white/[.2] dark:bg-black dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded bg-foreground px-2 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          Post
        </button>
      </form>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
