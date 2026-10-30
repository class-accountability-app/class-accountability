'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { JSONContent } from '@tiptap/core'

// 書き出す (Prompt 12): Word (.docx), built here in the browser from the text
// on screen (lib/docx-export.ts; the docx package loads only when used), or
// the print page for a PDF. A disclosure, not an ARIA menu: two buttons that
// Tab reaches in order, closed by Escape or a click elsewhere.
export function ExportMenu({
  title,
  getContent,
  onPdf,
}: {
  title: string
  getContent: () => JSONContent | null
  onPdf: () => void
}) {
  const t = useTranslations('editor.export')
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  async function word() {
    const content = getContent()
    if (!content) return
    setWorking(true)
    setFailed(false)
    try {
      const [{ Packer }, { buildDocx, docxFileName }] = await Promise.all([import('docx'), import('@/lib/docx-export')])
      const blob = await Packer.toBlob(buildDocx(content))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = docxFileName(title)
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setOpen(false)
      buttonRef.current?.focus()
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }

  const item =
    'flex min-h-11 w-full items-center px-3.5 text-left text-[15px] text-ink hover:bg-page-bg focus-visible:bg-page-bg disabled:opacity-50'

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          buttonRef.current?.focus()
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-accent-text underline underline-offset-4"
      >
        {t('open')}
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <div
        id={`${id}-menu`}
        hidden={!open}
        className="absolute right-0 z-20 mt-1 w-64 rounded-[2px] bg-surface py-1 shadow-[inset_0_0_0_1px_var(--border),0_6px_18px_rgba(58,47,34,0.18)]"
      >
        <button type="button" disabled={working} onClick={word} className={item}>
          {working ? t('working') : t('word')}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            onPdf()
          }}
          className={item}
        >
          {t('pdf')}
        </button>
        {failed && (
          <p role="alert" className="px-3.5 py-1 text-sm font-semibold text-accent-text">
            {t('failed')}
          </p>
        )}
      </div>
    </div>
  )
}
