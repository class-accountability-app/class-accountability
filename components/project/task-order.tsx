'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { canAddDependency, type Dependency } from '@/lib/planning'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { addDependency, removeDependency } from '@/app/classes/[classId]/project/planning-actions'

type Task = { id: string; title: string }

// タスクの順番 (0038): "this task starts after that one". Any team member sets
// it; the board then shows 「〜を待っています」 on a task whose earlier tasks
// aren't done. Folded by default, since most teams never need it.
export function TaskOrder({ classId, tasks, deps }: { classId: string; tasks: Task[]; deps: Dependency[] }) {
  const t = useTranslations('planning')
  const tCommon = useTranslations('common')
  const id = useId()
  const router = useRouter()
  const [after, setAfter] = useState(tasks[1]?.id ?? '')
  const [before, setBefore] = useState(tasks[0]?.id ?? '')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()
  const titleOf = new Map(tasks.map((x) => [x.id, x.title]))
  const allowed = after !== '' && before !== '' && canAddDependency(after, before, deps)

  function run(action: () => Promise<{ error: ErrorKey | null }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const select = (value: string, onChange: (v: string) => void, label: string, name: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${name}`} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={`${id}-${name}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
      >
        {tasks.map((x) => (
          <option key={x.id} value={x.id}>
            {x.title}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <details className="rule-card px-3.5 py-3.5">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between font-heading text-[17px] font-bold text-ink">
        {t('orderHeading')}
        <span className="text-[13px] font-normal text-muted">{t('orderCount', { count: deps.length })}</span>
      </summary>
      <p className="text-[13px] leading-7 text-muted">{t('orderWhy')}</p>
      {deps.length > 0 && (
        <ul className="flex flex-col">
          {deps.map((d) => (
            <li
              key={`${d.task_id}:${d.depends_on}`}
              className="flex items-center justify-between gap-2 border-b border-dashed border-border last:border-b-0"
            >
              <span className="text-[13px] leading-7 text-ink [overflow-wrap:anywhere]">
                {t('orderLine', { after: titleOf.get(d.task_id) ?? '', before: titleOf.get(d.depends_on) ?? '' })}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => removeDependency(classId, d.task_id, d.depends_on))}
                className="inline-flex min-h-11 shrink-0 items-center text-[13px] text-muted underline underline-offset-4"
              >
                {t('orderRemove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 pt-3.5">
        {select(after, setAfter, t('orderAfterLabel'), 'after')}
        {select(before, setBefore, t('orderBeforeLabel'), 'before')}
        {!allowed && after !== '' && <p className="text-[13px] leading-7 text-muted">{t('orderNotAllowed')}</p>}
        <FormError error={error} />
        <button
          type="button"
          disabled={isPending || !allowed}
          onClick={() => run(() => addDependency(classId, after, before))}
          className={`${secondaryButtonClass} self-start`}
        >
          {isPending ? tCommon('working') : t('orderAdd')}
        </button>
      </div>
    </details>
  )
}
