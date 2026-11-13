'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { chooseProject } from '@/app/classes/[classId]/project/switch-actions'

// プロジェクトを切りかえる (2026-11-13): shown only when the team has more than
// one active project. One pill per project, due soonest first; the current
// one is filled and says so to screen readers. The choice is remembered in
// this browser, so every project page (check-in, meetings, new task) follows.
export function ProjectSwitcher({
  classId,
  projects,
  currentId,
}: {
  classId: string
  projects: { id: string; title: string; due: string | null }[]
  currentId: string
}) {
  const t = useTranslations('project.switcher')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  if (projects.length < 2) return null

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-1.5">
      <p className="px-0.5 font-meta text-xs leading-6 font-bold tracking-[0.04em] text-accent-text">{t('label')}</p>
      <ul className="flex flex-wrap gap-2">
        {projects.map((p) => {
          const current = p.id === currentId
          return (
            <li key={p.id} className="min-w-0">
              <button
                type="button"
                disabled={isPending || current}
                aria-current={current ? 'true' : undefined}
                onClick={() =>
                  startTransition(async () => {
                    setError(null)
                    const result = await chooseProject(classId, p.id)
                    if (result.error) setError(result.error)
                    router.refresh()
                  })
                }
                className={`inline-flex min-h-11 max-w-full flex-col items-start justify-center rounded-2xl px-4 py-1.5 text-left text-sm font-semibold [overflow-wrap:anywhere] ${
                  current
                    ? 'bg-ink text-surface'
                    : 'bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-surface-container disabled:opacity-60'
                }`}
              >
                <span>
                  {p.title}
                  {current && <span className="sr-only">{t('current')}</span>}
                </span>
                {p.due && <span className={`font-meta text-xs font-normal ${current ? 'text-surface' : 'text-muted'}`}>{p.due}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <FormError error={error} />
    </nav>
  )
}
