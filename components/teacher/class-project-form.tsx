'use client'

import { useId, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TASK_METRICS } from '@/lib/tasks'
import { CLASS_PROJECT_MAX_TASKS, CLASS_PROJECT_PRESETS, type ClassProjectTaskRow } from '@/lib/class-project'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { saveClassProject } from '@/app/classes/[classId]/class-project-actions'

const control =
  'h-12 w-full min-w-0 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-base text-ink placeholder:text-muted'

const emptyRow = (): ClassProjectTaskRow => ({ title: '', metric: 'status', unit: '', target: '', daysBefore: '' })

// クラスのプロジェクト (0029): the project every new team in the class starts
// with. Title, deadline, check-in interval and the task list (each task's
// measure, goal and how many days before the deadline it is due). Presets
// fill the rows; changes apply to teams started from now on.
export function ClassProjectForm({
  classId,
  initial,
}: {
  classId: string
  initial: { title: string; deadline: string; every: string; tasks: ClassProjectTaskRow[] } | null
}) {
  const t = useTranslations('classProject')
  const locale = useLocale() === 'en' ? 'en' : 'ja'
  const id = useId()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [every, setEvery] = useState(initial?.every ?? '4')
  const [rows, setRows] = useState<ClassProjectTaskRow[]>(initial?.tasks ?? [])
  const [error, setError] = useState<ErrorKey | null>(null)
  const [taskIndex, setTaskIndex] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const update = (i: number, patch: Partial<ClassProjectTaskRow>) => {
    setSaved(false)
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setTaskIndex(null)
    setSaved(false)
    const formData = new FormData()
    formData.set('title', title)
    formData.set('deadline', deadline)
    formData.set('every', every)
    formData.set('tasks', JSON.stringify(rows))
    startTransition(async () => {
      const result = await saveClassProject(classId, formData)
      setError(result.error)
      setTaskIndex(result.taskIndex)
      if (!result.error) setSaved(true)
    })
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex w-full max-w-md flex-col gap-3.5">
      <div>
        <h2 id={`${id}-heading`} className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('title')}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{t('why')}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-[2px] border border-border bg-surface p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">{t('nameLabel')}</label>
          <input id={`${id}-title`} value={title} maxLength={120} placeholder={t('namePlaceholder')}
            onChange={(e) => { setTitle(e.target.value); setSaved(false) }} className={control} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-deadline`} className="text-sm font-semibold text-ink">{t('deadlineLabel')}</label>
          <input id={`${id}-deadline`} type="date" value={deadline}
            onChange={(e) => { setDeadline(e.target.value); setSaved(false) }} className={control} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-every`} className="text-sm font-semibold text-ink">{t('everyLabel')}</label>
          <div className="flex items-center gap-2.5">
            <input id={`${id}-every`} inputMode="numeric" autoComplete="off" value={every}
              onChange={(e) => { setEvery(e.target.value); setSaved(false) }} className={`${control} max-w-24`} />
            <span className="shrink-0 text-[15px] text-ink">{t('everySuffix')}</span>
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-ink">{t('tasksLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CLASS_PROJECT_PRESETS) as (keyof typeof CLASS_PROJECT_PRESETS)[]).map((key) => (
              <button key={key} type="button" className={secondaryButtonClass}
                onClick={() => { setRows(CLASS_PROJECT_PRESETS[key][locale].map((r) => ({ ...r }))); setSaved(false) }}>
                {t(`preset.${key}`)}
              </button>
            ))}
          </div>
          {rows.length === 0 && <p className="text-[13px] leading-7 text-muted">{t('noTasks')}</p>}
          <ol className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <li key={i} className={`flex flex-col gap-2 rounded-[2px] border p-3 ${taskIndex === i ? 'border-accent' : 'border-border'}`}>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-t${i}`} className="text-[13px] font-semibold text-ink">{t('taskTitleLabel', { n: i + 1 })}</label>
                  <input id={`${id}-t${i}`} value={row.title} maxLength={120} onChange={(e) => update(i, { title: e.target.value })} className={control} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-m${i}`} className="text-[13px] font-semibold text-ink">{t('metricLabel')}</label>
                  <select id={`${id}-m${i}`} value={row.metric} onChange={(e) => update(i, { metric: e.target.value as ClassProjectTaskRow['metric'] })} className={control}>
                    {TASK_METRICS.map((m) => <option key={m} value={m}>{t(`metric.${m}`)}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  {row.metric === 'count' && (
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label htmlFor={`${id}-u${i}`} className="text-[13px] font-semibold text-ink">{t('unitLabel')}</label>
                      <input id={`${id}-u${i}`} value={row.unit} maxLength={20} placeholder={t('unitPlaceholder')} onChange={(e) => update(i, { unit: e.target.value })} className={control} />
                    </div>
                  )}
                  {row.metric !== 'status' && (
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label htmlFor={`${id}-g${i}`} className="text-[13px] font-semibold text-ink">{t('targetLabel')}</label>
                      <input id={`${id}-g${i}`} inputMode="numeric" value={row.target} onChange={(e) => update(i, { target: e.target.value })} className={control} />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`${id}-d${i}`} className="text-[13px] font-semibold text-ink">{t('daysLabel')}</label>
                    <input id={`${id}-d${i}`} inputMode="numeric" value={row.daysBefore} onChange={(e) => update(i, { daysBefore: e.target.value })} className={control} />
                  </div>
                </div>
                <button type="button" onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setSaved(false) }}
                  className="inline-flex min-h-11 items-center self-start text-[13px] text-muted underline underline-offset-4">
                  {t('removeTask')}
                </button>
              </li>
            ))}
          </ol>
          {rows.length < CLASS_PROJECT_MAX_TASKS && (
            <button type="button" onClick={() => { setRows((rs) => [...rs, emptyRow()]); setSaved(false) }}
              className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4">
              ＋ {t('addTask')}
            </button>
          )}
        </fieldset>

        <p className="text-[13px] leading-7 text-muted">{t('appliesToNew')}</p>
        <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
          {isPending ? t('saving') : t('save')}
        </button>
        {taskIndex !== null && error && <p className="text-sm text-accent-text">{t('taskProblemAt', { n: taskIndex + 1 })}</p>}
        <FormError error={error} />
        <p aria-live="polite" className="min-h-7 text-sm leading-7 text-status-active">{saved ? t('saved') : ''}</p>
      </form>
    </section>
  )
}
