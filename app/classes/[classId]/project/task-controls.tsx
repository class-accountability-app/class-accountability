'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TASK_STATUSES, type TaskStatus } from '@/lib/tasks'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { addTemplateTasks, claimTask, finishProject, setTaskStatus, writeInApp } from './actions'
import { PROJECT_TEMPLATE_KEYS, type ProjectTemplateKey } from '@/lib/project-templates'

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
// 「Study Pods で書く」: turn one of my characters tasks into a document and
// open its editor.
export function WriteInAppButton({ classId, taskId }: { classId: string; taskId: string }) {
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
        className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-text underline underline-offset-4 disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await writeInApp(classId, taskId)
            if (result.error) {
              setError(result.error)
              return
            }
            router.push(`/classes/${classId}/project/tasks/${taskId}/write`)
          })
        }
      >
        {isPending ? tCommon('working') : t('writeInApp')}
      </button>
      <FormError error={error} />
    </div>
  )
}

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

// プロジェクトを完了する (0033): a link first, then a confirm step that says
// what finishing means, so nobody ends the team's project by a stray tap.
export function FinishProjectButton({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('project.finish')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  if (!asking) {
    return (
      <button
        type="button"
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4"
        onClick={() => setAsking(true)}
      >
        {t('button')}
      </button>
    )
  }

  return (
    <div role="group" aria-labelledby={`finish-${projectId}`} className="rule-card flex flex-col px-3.5 py-3.5">
      <p id={`finish-${projectId}`} className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('confirmTitle')}
      </p>
      <p className="text-[13px] leading-7 text-muted">{t('confirmBody')}</p>
      <div className="flex flex-wrap gap-3.5 pt-3.5">
        <button
          type="button"
          disabled={isPending}
          className={primaryButtonClass}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await finishProject(classId, projectId)
              if (result.error) {
                setError(result.error)
                return
              }
              router.refresh()
            })
          }
        >
          {isPending ? tCommon('working') : t('confirm')}
        </button>
        <button type="button" disabled={isPending} className={secondaryButtonClass} onClick={() => setAsking(false)}>
          {t('cancel')}
        </button>
      </div>
      <FormError error={error} />
    </div>
  )
}

// No tasks yet: pick a template and add its tasks (due dates counted back
// from the project's deadline).
export function TemplateTasksForm({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('project')
  const tTemplates = useTranslations('templates')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [template, setTemplate] = useState<ProjectTemplateKey>('presentation')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <div className="rule-card flex flex-col px-3.5 py-3.5">
      <label htmlFor={`template-${projectId}`} className="text-[15px] leading-7 font-semibold text-ink">
        {t('templateAddLabel')}
      </label>
      <p className="text-[13px] leading-7 text-muted">{t('templateHint')}</p>
      <div className="flex flex-wrap items-center gap-3.5 pt-1.5">
        <select
          id={`template-${projectId}`}
          value={template}
          onChange={(e) => setTemplate(e.target.value as ProjectTemplateKey)}
          className="h-11 min-w-0 flex-1 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-2.5 text-base text-ink"
        >
          {PROJECT_TEMPLATE_KEYS.map((key) => (
            <option key={key} value={key}>
              {tTemplates(key)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending}
          className={primaryButtonClass}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await addTemplateTasks(classId, projectId, template)
              if (result.error) {
                setError(result.error)
                return
              }
              router.refresh()
            })
          }
        >
          {isPending ? tCommon('working') : t('templateAdd')}
        </button>
      </div>
      <FormError error={error} />
    </div>
  )
}
