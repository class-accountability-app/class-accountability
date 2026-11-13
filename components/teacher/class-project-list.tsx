'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { CLASS_PROJECTS_MAX, type ClassProjectTaskRow } from '@/lib/class-project'
import { FormError } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { ClassProjectForm } from '@/components/teacher/class-project-form'
import { deleteClassProject } from '@/app/classes/[classId]/class-project-actions'

export type ClassProjectItem = {
  id: string
  title: string
  deadline: string // 'YYYY-MM-DD' or ''
  deadlineLabel: string | null // formatted on the server (lib/date.ts)
  every: string
  tasks: ClassProjectTaskRow[]
}

// クラスのプロジェクト (0045): the list of projects every team in the class
// gets. Each row opens its form; the last row adds a new one. Removing a
// project only takes it off the list: teams keep the copy they were given.
export function ClassProjectList({ classId, projects }: { classId: string; projects: ClassProjectItem[] }) {
  const t = useTranslations('classProject')
  return (
    <section aria-labelledby="class-projects-heading" className="flex w-full flex-col gap-3.5">
      <div>
        <h2 id="class-projects-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('title')}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{t('why')}</p>
      </div>
      {projects.length === 0 && <p className="text-sm leading-7 text-muted">{t('none')}</p>}
      {projects.map((p) => (
        <details key={p.id} className="rule-card tint-rubble px-5 py-4">
          <summary className="flex min-h-11 cursor-pointer flex-col justify-center">
            <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{p.title}</span>
            <span className="font-meta text-xs leading-5 text-muted">
              {p.deadlineLabel ? t('due', { date: p.deadlineLabel }) : t('noDeadline')}
              {' · '}
              {t('taskCount', { count: p.tasks.length })}
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-dashed border-ink/15 pt-4 mt-3">
            <ClassProjectForm
              classId={classId}
              projectId={p.id}
              initial={{ title: p.title, deadline: p.deadline, every: p.every, tasks: p.tasks }}
            />
            <RemoveProject classId={classId} projectId={p.id} />
          </div>
        </details>
      ))}
      {projects.length >= CLASS_PROJECTS_MAX ? (
        <p className="text-[13px] leading-7 text-muted">{t('full')}</p>
      ) : (
        <details className="rule-card px-5 py-4" open={projects.length === 0}>
          <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-semibold text-ink">
            ＋ {t('add')}
          </summary>
          <div className="border-t border-dashed border-ink/15 pt-4 mt-3">
            <ClassProjectForm classId={classId} projectId={null} initial={null} />
          </div>
        </details>
      )}
    </section>
  )
}

function RemoveProject({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('classProject')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex min-h-11 items-center self-start text-[13px] text-muted underline underline-offset-4"
      >
        {t('remove')}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm leading-7 text-ink">{t('removeConfirm')}</p>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={isPending}
          className={secondaryButtonClass}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteClassProject(classId, projectId)
              setError(result.error)
            })
          }
        >
          {t('removeYes')}
        </button>
        <button type="button" disabled={isPending} className={secondaryButtonClass} onClick={() => setAsking(false)}>
          {t('cancel')}
        </button>
      </div>
      <FormError error={error} />
    </div>
  )
}
