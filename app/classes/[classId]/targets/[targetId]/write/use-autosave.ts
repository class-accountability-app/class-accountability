'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import {
  MAX_MS,
  QUIET_MS,
  autosave,
  hasUnsaved,
  initialAutosave,
  retryDelay,
  type AutosaveState,
  type Theirs,
} from '@/lib/autosave'
import { deleteDraft, writeDraft, type LocalDraft } from '@/lib/local-draft'
import { keepMine, saveDocument, type SaveResult } from './actions'

// The editor's autosave: lib/autosave.ts decides, this hook does. It owns the
// timers (1.5 s quiet, 10 s max, the retry backoff), listens for online,
// tab hidden, page hide and IME composition, sends a save whenever the
// reducer asks (state.request), and keeps the IndexedDB draft in step: every
// edit is written there (throttled to 300 ms, and at once when the tab is
// hidden), and deleted once the server has that same edit.

const DRAFT_THROTTLE_MS = 300

type Options = {
  editor: Editor | null
  userId: string
  targetId: string
  initialVersion: number
  initialSavedAt: string | null
}

export function useAutosave({ editor, userId, targetId, initialVersion, initialSavedAt }: Options) {
  const [state, dispatch] = useReducer(autosave, undefined, () => initialAutosave(initialVersion, initialSavedAt))

  // Read by timers and event handlers, which outlive a render.
  const stateRef = useRef<AutosaveState>(state)
  const editorRef = useRef(editor)
  // Every edit goes up by one; a save carries the rev it sent.
  const rev = useRef(0)
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentRequest = useRef(0)
  const inflight = useRef<Promise<unknown> | null>(null)

  useEffect(() => {
    stateRef.current = state
    editorRef.current = editor
  })

  const saveDraftNow = useCallback(
    (baseVersion = stateRef.current.version) => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
      draftTimer.current = null
      const ed = editorRef.current
      if (!ed || ed.isDestroyed || rev.current === 0) return
      void writeDraft({
        userId,
        targetId,
        content: ed.getJSON(),
        baseVersion,
        rev: rev.current,
        editedAt: Date.now(),
      })
    },
    [userId, targetId]
  )

  // Called from the editor's onUpdate (a change made by typing, pasting,
  // undo; not by loading content).
  const edit = useCallback(() => {
    rev.current += 1
    dispatch({ type: 'EDIT' })
    draftTimer.current ??= setTimeout(() => saveDraftNow(), DRAFT_THROTTLE_MS)
    clearTimeout(quietTimer.current)
    quietTimer.current = setTimeout(() => dispatch({ type: 'QUIET' }), QUIET_MS)
    maxTimer.current ??= setTimeout(() => {
      maxTimer.current = null
      dispatch({ type: 'MAX' })
    }, MAX_MS)
  }, [saveDraftNow])

  const flush = useCallback(() => dispatch({ type: 'FLUSH' }), [])

  // Send a save when the reducer asks for one.
  useEffect(() => {
    if (state.status !== 'saving' || state.request === sentRequest.current) return
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    sentRequest.current = state.request
    const request = state.request
    const sentRev = rev.current
    const content = ed.getJSON()
    clearTimeout(quietTimer.current)
    if (maxTimer.current) clearTimeout(maxTimer.current)
    maxTimer.current = null

    const apply = (result: SaveResult) => {
      if (request !== sentRequest.current) return
      switch (result.status) {
        case 'saved':
          dispatch({ type: 'SAVE_OK', version: result.version, savedAt: result.updatedAt })
          // The server has this edit: the draft can go, unless newer typing
          // is in it (then it is rewritten on the new version).
          if (rev.current === sentRev) void deleteDraft(userId, targetId, sentRev)
          else saveDraftNow(result.version)
          break
        case 'conflict':
          dispatch({ type: 'SAVE_CONFLICT', theirs: result.theirs })
          break
        case 'rejected':
          dispatch({ type: 'SAVE_REJECTED', reason: result.reason })
          break
        case 'failed':
          dispatch({ type: 'SAVE_FAIL' })
      }
    }
    const promise = saveDocument(targetId, state.version, content, state.keepCurrent).then(apply, () =>
      // The request never reached the server (offline) or its answer never came.
      apply({ status: 'failed' })
    )
    inflight.current = promise
    void promise.finally(() => {
      if (inflight.current === promise) inflight.current = null
    })
  }, [state.status, state.request, state.version, state.keepCurrent, targetId, userId, saveDraftNow])

  // Retry with backoff.
  useEffect(() => {
    if (state.status !== 'retrying') return
    const timer = setTimeout(() => dispatch({ type: 'RETRY' }), retryDelay(state.attempt))
    return () => clearTimeout(timer)
  }, [state.status, state.attempt])

  // Online again, the tab hidden, the page going away.
  useEffect(() => {
    const online = () => dispatch({ type: 'ONLINE' })
    const hidden = () => {
      if (document.visibilityState !== 'hidden') return
      saveDraftNow()
      dispatch({ type: 'FLUSH' })
    }
    const pagehide = () => {
      saveDraftNow()
      dispatch({ type: 'FLUSH' })
    }
    // The browser's own "leave this page?" prompt while anything is unsaved.
    // The draft is in IndexedDB either way.
    const beforeunload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved(stateRef.current.status)) return
      saveDraftNow()
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('beforeunload', beforeunload)
    return () => {
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('beforeunload', beforeunload)
    }
  }, [saveDraftNow])

  // IME composition (Japanese input) and leaving the editor.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const start = () => dispatch({ type: 'COMPOSITION_START' })
    const end = () => dispatch({ type: 'COMPOSITION_END' })
    const blur = () => dispatch({ type: 'FLUSH' })
    dom.addEventListener('compositionstart', start)
    dom.addEventListener('compositionend', end)
    editor.on('blur', blur)
    return () => {
      dom.removeEventListener('compositionstart', start)
      dom.removeEventListener('compositionend', end)
      editor.off('blur', blur)
    }
  }, [editor])

  // Leaving by a link inside the app (no beforeunload): one last save after
  // any save on its way, and the draft written now. The page that opens next
  // reads the new total from the server.
  useEffect(() => {
    return () => {
      clearTimeout(quietTimer.current)
      if (maxTimer.current) clearTimeout(maxTimer.current)
      const s = stateRef.current
      const ed = editorRef.current
      if (!ed || ed.isDestroyed || s.blocked || s.status === 'saved' || s.status === 'conflict') return
      saveDraftNow()
      const content = ed.getJSON()
      const sentRev = rev.current
      void (inflight.current ?? Promise.resolve()).then(async () => {
        const result = await saveDocument(targetId, stateRef.current.version, content, stateRef.current.keepCurrent)
        if (result.status === 'saved') await deleteDraft(userId, targetId, sentRev)
      })
    }
  }, [saveDraftNow, targetId, userId])

  const chooseMine = useCallback(() => dispatch({ type: 'CHOOSE_MINE' }), [])

  // 保存されている内容を開く: this screen's text becomes a version, then
  // the saved text loads.
  const chooseTheirs = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return { error: 'generic' as const }
    const result = await keepMine(targetId, ed.getJSON())
    if (result.error || !result.theirs) return { error: result.error ?? ('generic' as const) }
    load(result.theirs)
    dispatch({ type: 'THEIRS_LOADED', version: result.theirs.version, savedAt: result.theirs.updatedAt })
    return { error: null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only touches refs
  }, [targetId])

  // Puts server text into the editor without counting as an edit.
  function load(theirs: Pick<Theirs, 'content'>) {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    ed.commands.setContent(theirs.content, { emitUpdate: false })
    rev.current = 0
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = null
    void deleteDraft(userId, targetId)
  }

  // A newer server version (a restore, or the page was older than the last
  // save): it becomes the editor's text.
  const loaded = useCallback(
    (theirs: Theirs) => {
      load(theirs)
      dispatch({ type: 'LOADED', version: theirs.version, savedAt: theirs.updatedAt })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only touches refs
    [userId, targetId]
  )

  // A draft found on opening goes into the editor as the text being worked
  // on (its rev too, so the save that stores it can delete it).
  const adopt = useCallback((draft: LocalDraft) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return false
    ed.commands.setContent(draft.content, { emitUpdate: false })
    rev.current = draft.rev
    return true
  }, [])

  // 復元する: typed on the version the server still has; save it now.
  const restoreDraft = useCallback(
    (draft: LocalDraft) => {
      if (!adopt(draft)) return
      edit()
      dispatch({ type: 'FLUSH' })
    },
    [adopt, edit]
  )

  // Typed on an older version: ask, as for any conflict.
  const openConflict = useCallback(
    (draft: LocalDraft, theirs: Theirs) => {
      if (adopt(draft)) dispatch({ type: 'OPEN_CONFLICT', theirs })
    },
    [adopt]
  )

  // Whether nothing has been typed since the page opened.
  const untouched = useCallback(() => rev.current === 0 && stateRef.current.status === 'saved', [])

  return { state, edit, flush, chooseMine, chooseTheirs, loaded, restoreDraft, openConflict, untouched }
}
