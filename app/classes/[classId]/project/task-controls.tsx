'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TASK_STATUSES, type TaskStatus } from '@/lib/tasks'
import { STUCK_NOTE_MAX } from '@/lib/stuck'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { addTemplateTasks, claimTask, finishProject, handOverTask, setTaskStatus, setTaskStuck, shareOutTasks, writeInApp } from './actions'
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
        className="h-11 rounded-lg border border-outline bg-surface px-2.5 text-base text-ink disabled:opacity-50"
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
        className={secondaryButtonClass}
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
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
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
    <div role="group" aria-labelledby={`finish-${projectId}`} className="rule-card flex flex-col px-5 py-5">
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
    <div className="rule-card flex flex-col px-5 py-5">
      <label htmlFor={`template-${projectId}`} className="text-[15px] leading-7 font-semibold text-ink">
        {t('templateAddLabel')}
      </label>
      <p className="text-[13px] leading-7 text-muted">{t('templateHint')}</p>
      <div className="flex flex-wrap items-center gap-3.5 pt-1.5">
        <select
          id={`template-${projectId}`}
          value={template}
          onChange={(e) => setTemplate(e.target.value as ProjectTemplateKey)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-outline bg-surface px-2.5 text-base text-ink"
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

// 担当を変える on one of my tasks: folded away until wanted, then a teammate
// (or nobody) and one button. Not offered on a task written in Study Pods.
export function HandOverControl({
  classId,
  taskId,
  teammates,
}: {
  classId: string
  taskId: string
  teammates: { id: string; name: string }[]
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const [to, setTo] = useState(teammates[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <details className="pb-1">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-accent-text underline underline-offset-4">
        {t('handOver.open')}
      </summary>
      <div className="flex flex-col gap-2 pb-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {t('handOver.to')}
        </label>
        <div className="flex flex-wrap gap-2">
          <select
            id={id}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
          >
            {teammates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="">{t('handOver.nobody')}</option>
          </select>
          <button
            type="button"
            disabled={isPending}
            className={`${secondaryButtonClass} h-11 px-4 text-sm`}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await handOverTask(classId, taskId, to || null)
                if (result.error) setError(result.error)
                router.refresh()
              })
            }
          >
            {isPending ? tCommon('working') : t('handOver.submit')}
          </button>
        </div>
        <p className="text-[13px] leading-6 text-muted">{t('handOver.hint')}</p>
        <FormError error={error} />
      </div>
    </details>
  )
}

// みんなに割りふる: on the card of tasks nobody has taken, when the team has
// more than one member. One tap, then a confirm, since it moves several tasks.
export function ShareOutButton({ classId, projectId, count }: { classId: string; projectId: string; count: number }) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  if (!confirming) {
    return (
      <div className="pt-2">
        <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setConfirming(true)}>
          {t('shareOut.open')}
        </button>
      </div>
    )
  }
  return (
    <div role="group" aria-label={t('shareOut.open')} className="flex flex-col gap-2 pt-2">
      <p className="text-sm leading-7 text-ink">{t('shareOut.confirm', { count })}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          className={primaryButtonClass}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await shareOutTasks(classId, projectId)
              if (result.error) setError(result.error)
              else setConfirming(false)
              router.refresh()
            })
          }
        >
          {isPending ? tCommon('working') : t('shareOut.submit')}
        </button>
        <button type="button" disabled={isPending} className={secondaryButtonClass} onClick={() => setConfirming(false)}>
          {tCommon('cancel')}
        </button>
      </div>
      <FormError error={error} />
    </div>
  )
}

// 「困っています」 on one of my open tasks (0047): one line the team can read.
// While it is up, the note shows with 解決した; otherwise the form is folded away.
export function StuckControl({ classId, taskId, note }: { classId: string; taskId: string; note: string | null }) {
  const t = useTranslations('project.stuck')
  const router = useRouter()
  const id = useId()
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  const send = (value: string | null) =>
    startTransition(async () => {
      setError(null)
      const result = await setTaskStuck(classId, taskId, value)
      if (result.error) setError(result.error)
      else setText('')
      router.refresh()
    })

  if (note !== null) {
    return (
      <div className="flex flex-col gap-1 pb-2">
        <button type="button" disabled={isPending} className={`${secondaryButtonClass} h-11 self-start px-4 text-sm`} onClick={() => send(null)}>
          {t('resolve')}
        </button>
        <FormError error={error} />
      </div>
    )
  }
  return (
    <details className="pb-1">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-accent-text underline underline-offset-4">
        {t('open')}
      </summary>
      <div className="flex flex-col gap-2 pb-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {t('label')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={id}
            value={text}
            maxLength={STUCK_NOTE_MAX}
            placeholder={t('placeholder')}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${id}-hint`}
            className="h-11 min-w-0 flex-1 rounded-lg border border-outline bg-surface px-3 text-base text-ink placeholder:text-muted"
          />
          <button type="button" disabled={isPending} className={`${secondaryButtonClass} h-11 px-4 text-sm`} onClick={() => send(text)}>
            {t('submit')}
          </button>
        </div>
        <p id={`${id}-hint`} className="text-[13px] leading-6 text-muted">
          {t('hint')}
        </p>
        <FormError error={error} />
      </div>
    </details>
  )
}
