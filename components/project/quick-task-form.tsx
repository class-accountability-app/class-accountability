'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { addTask } from '@/app/classes/[classId]/project/actions'

// 決まったことをタスクにする (2026-11-12), on a confirmed meeting's page: what
// the team just decided becomes a task with an owner without leaving the
// page, so it doesn't stay buried in the notes. A plain to-do (状態のみ); a
// counted task is still made on 新しいタスク. Stays open to add several.
export function QuickTaskForm({
  classId,
  projectId,
  members,
}: {
  classId: string
  projectId: string
  members: { id: string; name: string }[]
}) {
  const t = useTranslations('planning')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAdded(null)
    if (!title.trim()) {
      setError('titleRequired')
      titleRef.current?.focus()
      return
    }
    setError(null)
    const data = new FormData()
    data.set('title', title)
    data.set('metric', 'status')
    data.set('owner_id', owner)
    startTransition(async () => {
      const result = await addTask(classId, projectId, data)
      if (result.error) {
        setError(result.error)
        return
      }
      setAdded(title.trim())
      setTitle('')
      titleRef.current?.focus()
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-heading`} className="rule-card flex flex-col gap-3.5 px-5 py-5">
      <div>
        <h2 id={`${id}-heading`} className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('quickTaskHeading')}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{t('quickTaskWhy')}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">
          {t('quickTaskTitle')}
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          type="text"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="done"
          aria-invalid={error === 'titleRequired' || undefined}
          aria-describedby={`${id}-status`}
          className="h-12 w-full rounded-lg border border-outline bg-surface px-3.5 text-base text-ink placeholder:text-muted"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-owner`} className="text-sm font-semibold text-ink">
          {t('quickTaskOwner')}
        </label>
        <select
          id={`${id}-owner`}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="h-12 w-full rounded-lg border border-outline bg-surface px-3.5 text-base text-ink"
        >
          <option value="">{t('quickTaskNobody')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className={`${secondaryButtonClass} w-full`}>
        {isPending ? tCommon('working') : t('quickTaskAdd')}
      </button>
      <div id={`${id}-status`}>
        {added && (
          <p role="status" className="text-sm leading-7 text-status-active">
            ✓ {t('quickTaskAdded', { title: added })}
          </p>
        )}
        <FormError error={error} />
      </div>
    </form>
  )
}
