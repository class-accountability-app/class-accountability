'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { ErrorKey } from '@/lib/errors'
import { editorExtensions } from '@/lib/editor-extensions'
import { countDocument, type DocNode } from '@/lib/char-count'
import { MAX_DOCUMENT_CHARS } from '@/lib/doc-schema'
import { wordListsToHtml } from '@/lib/paste-word'
import { decideDraft, deleteDraft, dropStaleDrafts, readDraft, type LocalDraft } from '@/lib/local-draft'
import { ProgressBar } from '@/components/progress-bar'
import { currentDocument, restoreVersion } from './actions'
import { useAutosave } from './use-autosave'
import { Toolbar } from './toolbar'
import { SaveStatus } from './save-status'
import { ConflictDialog, DraftDialog } from './conflict-dialog'
import { HistoryPanel } from './history-panel'
import { ExportMenu } from './export-menu'

// 「Study Pods で書く」 (Prompt 12): the editor for one document target.
// Tiptap's hook API (useEditor + EditorContent): the editor lives in this
// one component, so the composable <Tiptap> provider adds nothing.
//
// The text is saved by useAutosave (lib/autosave.ts); unsaved typing waits in
// IndexedDB (lib/local-draft.ts). The count shown here is only a preview: the
// server recounts every save, and the progress logs follow its count.

type Initial = { content: JSONContent; version: number; updatedAt: string | null }

const COUNT_THROTTLE_MS = 150

export function Editor({
  userId,
  classId,
  className,
  targetId,
  title,
  targetAmount,
  initial,
}: {
  userId: string
  classId: string
  className: string
  targetId: string
  title: string
  targetAmount: number | null
  initial: Initial
}) {
  const t = useTranslations('editor')
  const tUnits = useTranslations('units')
  const tAmounts = useTranslations('amounts')
  const router = useRouter()

  const [count, setCount] = useState(() => countDocument(initial.content as DocNode))
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [offer, setOffer] = useState<LocalDraft | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pdfPending, setPdfPending] = useState(false)

  // Built once: a new array each render would make Tiptap reapply its
  // options on every render.
  const extensions = useMemo(() => editorExtensions(), [])
  const editorProps = useMemo(
    () => ({
      attributes: {
        id: 'document-editor',
        'aria-label': t('label'),
        'aria-multiline': 'true',
        role: 'textbox',
        'aria-describedby': 'document-count-hint',
      },
      transformPastedHTML: wordListsToHtml,
    }),
    [t]
  )

  // Set below; onUpdate reads it at call time.
  const editRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions,
    content: initial.content,
    // Rendered only in the browser: the server has no DOM for ProseMirror,
    // and rendering twice would mismatch on hydration.
    immediatelyRender: false,
    // The toolbar subscribes to what it needs (useEditorState); the rest of
    // the page doesn't re-render on every keystroke.
    shouldRerenderOnTransaction: false,
    editorProps,
    onUpdate: () => editRef.current(),
  })

  // The count follows every change to the text, typed or loaded (a restore,
  // a conflict choice, a draft), at most every 150 ms.
  useEffect(() => {
    if (!editor) return
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return
      countTimer.current ??= setTimeout(() => {
        countTimer.current = null
        if (!editor.isDestroyed) setCount(countDocument(editor.getJSON() as DocNode))
      }, COUNT_THROTTLE_MS)
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      if (countTimer.current) clearTimeout(countTimer.current)
      countTimer.current = null
    }
  }, [editor])

  const autosave = useAutosave({
    editor,
    userId,
    targetId,
    initialVersion: initial.version,
    initialSavedAt: initial.updatedAt,
  })
  const { state, edit, flush, chooseMine, chooseTheirs, loaded, restoreDraft, openConflict, untouched } = autosave
  useEffect(() => {
    editRef.current = edit
  }, [edit])

  // On opening: drop old and other people's drafts, check the server still
  // has this version (Back can show an older page), then offer a draft back.
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    void (async () => {
      const now = Date.now()
      await dropStaleDrafts(userId, now)
      const [{ theirs }, draft] = await Promise.all([
        currentDocument(targetId).catch(() => ({ theirs: null })),
        readDraft(userId, targetId),
      ])
      if (cancelled || editor.isDestroyed) return

      let server: { version: number; content: JSONContent } = { version: initial.version, content: editor.getJSON() }
      if (theirs && theirs.version > initial.version && untouched()) {
        loaded(theirs)
        server = { version: theirs.version, content: theirs.content }
      }
      const decision = decideDraft(draft, { userId, ...server }, now)
      if (decision.kind === 'none') {
        if (decision.discard) void deleteDraft(userId, targetId)
      } else if (decision.kind === 'offer') {
        setOffer(decision.draft)
      } else if (theirs) {
        openConflict(decision.draft, theirs)
      }
    })()
    return () => {
      cancelled = true
    }
    // Once per editor: the initial version is fixed for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // PDF: the print page reads the saved text, so wait for the save first.
  useEffect(() => {
    if (pdfPending && state.status === 'saved') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot navigation once saving has finished
      setPdfPending(false)
      router.push(`/classes/${classId}/targets/${targetId}/write/print`)
    }
  }, [pdfPending, state.status, router, classId, targetId])

  const amountText = (n: number) => tUnits('character_count', { count: n })
  const countLine =
    targetAmount === null ? amountText(count) : tAmounts('character_count', { logged: count, target: targetAmount })
  const tooLong = count > MAX_DOCUMENT_CHARS

  async function onRestore(versionId: string): Promise<{ error: ErrorKey | null }> {
    const result = await restoreVersion(targetId, state.version, versionId)
    if (result.status === 'saved' && result.content) {
      loaded({ content: result.content, version: result.version, updatedAt: result.updatedAt, charCount: 0 })
      setNotice(t('history.restored'))
      return { error: null }
    }
    if (result.status === 'conflict') {
      openConflict(
        { userId, targetId, content: (editor?.getJSON() as JSONContent | undefined) ?? initial.content, baseVersion: state.version, rev: 0, editedAt: Date.now() },
        result.theirs
      )
      return { error: null }
    }
    return { error: result.status === 'rejected' ? result.reason : 'generic' }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-3xl flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <p className="font-meta text-[13px] leading-7 text-muted">{className}</p>
          <Link
            href={`/classes/${classId}`}
            className="print-hidden inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            {t('back')}
          </Link>
        </div>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink [overflow-wrap:anywhere]">{title}</h1>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <p className={`font-meta leading-7 ${tooLong ? 'font-bold text-accent-text' : 'text-ink'}`}>{countLine}</p>
            <div className="flex items-center gap-3">
              <HistoryPanel targetId={targetId} canRestore={state.status === 'saved'} onRestore={onRestore} />
              <ExportMenu
                title={title}
                getContent={() => (editor && !editor.isDestroyed ? editor.getJSON() : null)}
                onPdf={() => {
                  flush()
                  setPdfPending(true)
                }}
              />
            </div>
          </div>
          {targetAmount !== null && <ProgressBar value={count} max={targetAmount} valueText={countLine} />}
          {/* Over 100,000 characters the server refuses the save, and the
              status line says so (errors.documentTooLong). */}
          <SaveStatus state={state} onSaveNow={flush} />
          {notice && (
            <p role="status" className="text-sm leading-7 text-ink">
              {notice}
            </p>
          )}
        </div>

        <Toolbar editor={editor} />
        <div className="rule-card px-3.5 py-3.5 sm:px-5">
          <EditorContent editor={editor} className="doc-body" />
        </div>

        <p id="document-count-hint" className="text-[13px] leading-7 text-muted">
          {t('countHint')} {t('privacyNote')}
        </p>
      </div>

      <ConflictDialog
        theirs={state.status === 'conflict' ? state.theirs : null}
        mineCount={amountText(count)}
        onMine={chooseMine}
        onTheirs={chooseTheirs}
      />
      <DraftDialog
        editedAt={offer?.editedAt ?? null}
        count={offer ? amountText(countDocument(offer.content as DocNode)) : ''}
        onRestore={() => {
          if (offer) restoreDraft(offer)
          setOffer(null)
        }}
        onDiscard={() => {
          void deleteDraft(userId, targetId)
          setOffer(null)
        }}
      />
    </div>
  )
}
