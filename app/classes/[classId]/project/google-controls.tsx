'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass } from '@/components/buttons'
import { DOC_TEMPLATE_KEYS } from '@/lib/doc-templates'
import { SLIDE_TEMPLATE_KEYS } from '@/lib/slide-templates'
import { SHEET_TEMPLATE_KEYS } from '@/lib/sheet-templates'
import { createTaskDoc, createTaskSheet, createTaskSlides, requestGoogleSync } from './google-actions'

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
// For a counted task (`files`), a deck (lib/slide-templates.ts) or a sheet
// (lib/sheet-templates.ts), as "slides:<key>" or "sheet:<key>".
function DocTemplateSelect({
  value,
  onChange,
  files = false,
}: {
  value: string
  onChange: (v: string) => void
  files?: boolean
}) {
  const t = useTranslations('google')
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {t(files ? 'fileTemplateLabel' : 'templateLabel')}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        className="h-11 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
      >
        {files ? (
          <>
            <optgroup label={t('fileTemplateSlides')}>
              {SLIDE_TEMPLATE_KEYS.map((key) => (
                <option key={key} value={`slides:${key}`}>
                  {t(`slideTemplates.${key}`)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('fileTemplateSheets')}>
              {SHEET_TEMPLATE_KEYS.map((key) => (
                <option key={key} value={`sheet:${key}`}>
                  {t(`sheetTemplates.${key}`)}
                </option>
              ))}
            </optgroup>
          </>
        ) : (
          <>
            <option value="">{t('templateNone')}</option>
            {DOC_TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`docTemplates.${key}`)}
              </option>
            ))}
          </>
        )}
      </select>
      <p id={`${id}-hint`} className="text-[13px] leading-6 text-muted">
        {t(files ? (value.startsWith('sheet:') ? 'sheetTemplateHint' : 'slideTemplateHint') : 'templateHint')}
      </p>
    </div>
  )
}

// テンプレートから新しいドキュメントを作る, on my characters task's link page:
// the Doc is made in my Drive and linked; then back to the board.
// The same for a counted task (`files`): a Slides deck or a Sheet.
export function CreateTaskDocForm({
  classId,
  taskId,
  files = false,
  replacing = false,
}: {
  classId: string
  taskId: string
  files?: boolean
  // The task already has a file: the new one takes its place.
  replacing?: boolean
}) {
  const t = useTranslations('google')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [template, setTemplate] = useState(files ? 'slides:presentation' : 'report')
  return (
    <div className="flex flex-col gap-3.5">
      <DocTemplateSelect value={template} onChange={setTemplate} files={files} />
      <div className="flex flex-col">
        <button
          type="button"
          disabled={isPending}
          className={`${primaryButtonClass} w-full`}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const [kind, key] = template.split(':')
              const result = !files
                ? await createTaskDoc(classId, taskId, template)
                : kind === 'sheet'
                  ? await createTaskSheet(classId, taskId, key)
                  : await createTaskSlides(classId, taskId, key)
              if (result.error) {
                setError(result.error)
                return
              }
              router.push(`/classes/${classId}/project`)
              router.refresh()
            })
          }
        >
          {isPending ? t('creating') : t(replacing ? 'taskDocReplace' : 'taskDocCreate')}
        </button>
        <FormError error={error} />
      </div>
    </div>
  )
}
