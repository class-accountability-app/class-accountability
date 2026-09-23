'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import {
  FieldError,
  FormError,
  describedField,
  useFocusFirstInvalid,
} from '@/components/form-errors'
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
  const t = useTranslations('comments')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [postError, setPostError] = useState<ErrorKey | null>(null)
  const [deleteError, setDeleteError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, postError)

  const fieldId = `${id}-comment`
  const errorId = `${fieldId}-error`

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPostError(null)
    setDeleteError(null)
    const formData = new FormData(e.currentTarget)

    if (!formData.get('body')?.toString().trim()) {
      setPostError('commentEmpty')
      return
    }

    startTransition(async () => {
      const result = await addComment(classId, progressLogId, formData)
      if (result.error) {
        setPostError(result.error)
        return
      }
      formRef.current?.reset()
    })
  }

  function handleDelete(commentId: string) {
    setPostError(null)
    setDeleteError(null)
    setDeletingId(commentId)
    startTransition(async () => {
      const result = await deleteComment(classId, commentId)
      setDeletingId(null)
      setDeleteError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <span className="text-xs text-ink">
                <span className="font-medium text-accent-text">{t('author', { name: c.authorName })}</span>{' '}
                {c.body}
              </span>
              {c.author_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending && deletingId === c.id}
                  className="shrink-0 text-xs text-muted underline disabled:opacity-50"
                >
                  {t('delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError error={deleteError} />
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-xs font-medium text-muted">
          {t('label')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={fieldId}
            type="text"
            name="body"
            maxLength={280}
            placeholder={t('placeholder')}
            className="min-w-0 flex-1 rounded-[2px] border border-border bg-surface px-2 py-1.5 text-ink placeholder:text-muted"
            {...describedField(postError, errorId)}
          />
          <button
            type="submit"
            disabled={isPending}
            className="btn shrink-0 rounded-[2px] bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {t('post')}
          </button>
        </div>
        <FieldError id={errorId} error={postError} />
      </form>
    </div>
  )
}
