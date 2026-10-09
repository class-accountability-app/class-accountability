'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { JSONContent } from '@tiptap/core'
import type { Locale } from '@/i18n/config'
import type { ErrorKey } from '@/lib/errors'
import { formatDateTime } from '@/lib/date'
import { DocView } from '@/components/doc-view'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { getVersion, listVersions, type VersionItem } from './actions'

type Preview = { item: VersionItem; content: JSONContent }

// 履歴 (Prompt 12): the kept versions, newest first (0019 keeps one per 10
// minutes of writing, plus one before each restore or conflict choice, the
// newest 50). Pick one to read it; この版に戻す asks first, and only once
// everything typed is saved (canRestore), so a restore never races autosave.
export function HistoryPanel({
  targetId,
  canRestore,
  onRestore,
}: {
  targetId: string
  canRestore: boolean
  onRestore: (versionId: string) => Promise<{ error: ErrorKey | null }>
}) {
  const t = useTranslations('editor.history')
  const tUnits = useTranslations('units')
  const tErrors = useTranslations('errors')
  const locale = useLocale() as Locale
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionItem[] | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  async function show() {
    setOpen(true)
    setVersions(null)
    setPreview(null)
    setConfirming(false)
    setError(null)
    const result = await listVersions(targetId).catch(() => ({ error: 'generic' as const, versions: [] }))
    setError(result.error)
    setVersions(result.versions)
  }

  async function view(item: VersionItem) {
    setError(null)
    setConfirming(false)
    const result = await getVersion(targetId, item.id).catch(() => ({ error: 'generic' as const, content: undefined }))
    if (result.error || !result.content) setError(result.error ?? 'generic')
    else setPreview({ item, content: result.content })
  }

  async function restore() {
    if (!preview) return
    setWorking(true)
    setError(null)
    const result = await onRestore(preview.item.id).catch(() => ({ error: 'generic' as const }))
    setWorking(false)
    if (result.error) setError(result.error)
    else setOpen(false)
  }

  const when = (item: VersionItem) => formatDateTime(item.createdAt, locale)

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={show}
        className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent-text underline underline-offset-4"
      >
        {t('open')}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="history-title"
        onClose={() => {
          setOpen(false)
          openerRef.current?.focus()
        }}
        className="m-auto flex max-h-[min(90dvh,760px)] w-[calc(100%-2rem)] max-w-2xl flex-col rounded-[2px] bg-surface p-0 text-ink shadow-[inset_0_0_0_1px_var(--border)] backdrop:bg-ink/40 [&:not([open])]:hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2">
          <h2 id="history-title" className="font-heading text-lg leading-7 font-bold">
            {preview ? t('previewTitle', { when: when(preview.item) }) : t('title')}
          </h2>
          <button
            type="button"
            onClick={() => (preview ? setPreview(null) : setOpen(false))}
            className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            {t('close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-sm font-semibold text-accent-text">
              {tErrors(error)}
            </p>
          )}
          {preview ? (
            <DocView content={preview.content} />
          ) : versions === null ? (
            <p className="text-sm leading-7 text-muted">{t('loading')}</p>
          ) : (
            <>
              <p className="text-[13px] leading-7 text-muted">{t('intro')}</p>
              {versions.length === 0 ? (
                <p className="text-sm leading-7 text-muted">{t('empty')}</p>
              ) : (
                <ul className="flex flex-col">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 border-b border-dashed border-border py-1.5 last:border-b-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-meta text-[13px] leading-6">
                          {t('item', { when: when(v), count: tUnits('character_count', { count: v.charCount }) })}
                        </span>
                        <span className="text-xs leading-5 text-muted">{t(`reason.${v.reason}`)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => view(v)}
                        className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-accent-text underline underline-offset-4"
                      >
                        {t('preview')}
                        <span className="sr-only">：{when(v)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {preview && (
          <div className="flex flex-col gap-2 border-t border-border px-5 py-3">
            {!canRestore ? (
              <p className="text-sm leading-7 text-muted">{t('restoreWait')}</p>
            ) : confirming ? (
              <div role="group" aria-labelledby="restore-confirm" className="flex flex-col gap-2">
                <p id="restore-confirm" className="text-sm leading-7">
                  {t('restoreConfirm')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={working} onClick={restore} className={primaryButtonClass}>
                    {t('restoreYes')}
                  </button>
                  <button type="button" disabled={working} onClick={() => setConfirming(false)} className={secondaryButtonClass}>
                    {t('restoreNo')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={`${secondaryButtonClass} self-start`}>
                {t('restore')}
              </button>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}
