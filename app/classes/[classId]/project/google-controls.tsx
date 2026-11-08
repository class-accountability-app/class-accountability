'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { DOC_TEMPLATE_KEYS } from '@/lib/doc-templates'
import { createGroupDoc, createTaskDoc, requestGoogleSync } from './google-actions'

// Opening the board asks for a re-count of the pod's linked files (the
// database allows one per student per 2 minutes). When one was asked for, the
// board refreshes once a few seconds later to show the new numbers.
const REFRESH_AFTER_MS = 8000

export function GoogleSyncOnOpen() {
  const router = useRouter()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    requestGoogleSync().then((queued) => {
      if (queued) timer = setTimeout(() => router.refresh(), REFRESH_AFTER_MS)
    })
    return () => clearTimeout(timer)
  }, [router])
  return null
}

// 見出しのテンプレート (2026-11-08): none, or one of lib/doc-templates.ts.
function DocTemplateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('google')
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {t('templateLabel')}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        className="h-11 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
      >
        <option value="">{t('templateNone')}</option>
        {DOC_TEMPLATE_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(`docTemplates.${key}`)}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-[13px] leading-6 text-muted">
        {t('templateHint')}
      </p>
    </div>
  )
}

export function CreateGroupDocButton({ classId, projectId }: { classId: string; projectId: string }) {
  const t = useTranslations('google')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [template, setTemplate] = useState('')
  return (
    <div className="flex flex-col gap-3.5">
      <DocTemplateSelect value={template} onChange={setTemplate} />
      <div className="flex flex-col">
        <button
          type="button"
          disabled={isPending}
          className={`${secondaryButtonClass} w-full`}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await createGroupDoc(classId, projectId, template)
              if (result.error) {
                setError(result.error)
                return
              }
              router.refresh()
            })
          }
        >
          {isPending ? t('creating') : t('groupDocCreate')}
        </button>
        <FormError error={error} />
      </div>
    </div>
  )
}

// テンプレートから新しいドキュメントを作る, on my characters task's link page:
// the Doc is made in my Drive and linked; then back to the board.
export function CreateTaskDocForm({ classId, taskId }: { classId: string; taskId: string }) {
  const t = useTranslations('google')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [template, setTemplate] = useState('report')
  return (
    <div className="flex flex-col gap-3.5">
      <DocTemplateSelect value={template} onChange={setTemplate} />
      <div className="flex flex-col">
        <button
          type="button"
          disabled={isPending}
          className={`${primaryButtonClass} w-full`}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await createTaskDoc(classId, taskId, template)
              if (result.error) {
                setError(result.error)
                return
              }
              router.push(`/classes/${classId}/project`)
              router.refresh()
            })
          }
        >
          {isPending ? t('creating') : t('taskDocCreate')}
        </button>
        <FormError error={error} />
      </div>
    </div>
  )
}
