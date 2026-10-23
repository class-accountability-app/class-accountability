'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TASK_STATUSES, type TaskStatus } from '@/lib/tasks'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { claimTask, setTaskStatus } from './actions'

// The status of one of my tasks: a native select, so it's one tap on a phone
// and the keyboard works without extra code.
export function TaskStatusControl({ classId, taskId, status }: { classId: string; taskId: string; status: TaskStatus }) {
  const t = useTranslations('project')
  const router = useRouter()
  const [value, setValue] = useState(status)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  function change(next: TaskStatus) {
    const previous = value
    setValue(next)
    setError(null)
    startTransition(async () => {
      const result = await setTaskStatus(classId, taskId, next)
      if (result.error) {
        setValue(previous)
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <label className="sr-only" htmlFor={`status-${taskId}`}>
        {t('statusLabel')}
      </label>
      <select
        id={`status-${taskId}`}
        value={value}
        disabled={isPending}
        onChange={(e) => change(e.target.value as TaskStatus)}
        className="h-11 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-2.5 text-base text-ink disabled:opacity-50"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </select>
      <FormError error={error} />
    </div>
  )
}

// 担当する on a task nobody owns yet.
export function ClaimButton({ classId, taskId }: { classId: string; taskId: string }) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        disabled={isPending}
        className={secondaryButtonClass}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await claimTask(classId, taskId)
            if (result.error) setError(result.error)
            router.refresh()
          })
        }
      >
        {isPending ? tCommon('working') : t('claim')}
      </button>
      <FormError error={error} />
    </div>
  )
}
