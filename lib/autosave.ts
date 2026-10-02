import type { JSONContent } from '@tiptap/core'

// The editor's autosave (Prompt 12), as a pure reducer: no timers, no
// network. use-autosave.ts turns timers, online/offline, visibility and the
// server's answers into these events, and sends a save whenever `request`
// goes up. Every change is also written to IndexedDB at once (local-draft.ts),
// so nothing typed is lost while a save waits or fails.
//
//   saved ──EDIT──▶ dirty ──QUIET / MAX / FLUSH──▶ saving ──SAVE_OK──▶ saved
//                                                    │ EDIT
//                                                    ▼
//                                               savingDirty ──SAVE_OK──▶ saving (again)
//   saving / savingDirty ──SAVE_FAIL──▶ retrying ──RETRY / ONLINE / FLUSH──▶ saving
//   saving / savingDirty ──SAVE_CONFLICT──▶ conflict (autosave stops)
//   conflict ──CHOOSE_MINE──▶ saving (theirs kept as a version first)
//   conflict ──THEIRS_LOADED──▶ saved (mine was kept as a version first)
//   saving / savingDirty ──SAVE_REJECTED──▶ dirty, blocked until the next EDIT
//   saved ──OPEN_CONFLICT──▶ conflict (a draft from an older version, on load)
//
// While an IME composition is open (Japanese input), a save trigger is held
// and fires at COMPOSITION_END, so a half-converted word is never saved.

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'savingDirty' | 'retrying' | 'conflict'

export type Theirs = { version: number; content: JSONContent; charCount: number; updatedAt: string }

export type AutosaveState = {
  status: SaveStatus
  // The server version this text is based on (save_document's p_expected_version).
  version: number
  // Goes up by one for every save use-autosave.ts should send now.
  request: number
  // For the save being sent: keep the server's text as a version first
  // (CHOOSE_MINE after a conflict).
  keepCurrent: 'conflict' | null
  composing: boolean
  // A save was asked for during composition.
  held: boolean
  // Failed saves in a row (for the backoff).
  attempt: number
  savedAt: string | null
  theirs: Theirs | null
  // The server refused the text (too long, not valid, signed out): no more
  // saves until it changes. The error says why.
  blocked: RejectReason | null
}

export type RejectReason = 'documentTooLong' | 'documentInvalid' | 'signedOut' | 'notOwnTarget'

export type AutosaveEvent =
  | { type: 'EDIT' }
  | { type: 'QUIET' } // 1.5 s without typing
  | { type: 'MAX' } // 10 s of typing without a save
  | { type: 'FLUSH' } // blur, tab hidden, 今すぐ保存, leaving
  | { type: 'COMPOSITION_START' }
  | { type: 'COMPOSITION_END' }
  | { type: 'SAVE_OK'; version: number; savedAt: string }
  | { type: 'SAVE_FAIL' }
  | { type: 'SAVE_REJECTED'; reason: RejectReason }
  | { type: 'OPEN_CONFLICT'; theirs: Theirs }
  | { type: 'RETRY' }
  | { type: 'ONLINE' }
  | { type: 'SAVE_CONFLICT'; theirs: Theirs }
  | { type: 'CHOOSE_MINE' }
  | { type: 'THEIRS_LOADED'; version: number; savedAt: string }
  // The page loaded a newer version from elsewhere (a restore).
  | { type: 'LOADED'; version: number; savedAt: string }

export const QUIET_MS = 1500
export const MAX_MS = 10_000

export function initialAutosave(version: number, savedAt: string | null): AutosaveState {
  return {
    status: 'saved',
    version,
    request: 0,
    keepCurrent: null,
    composing: false,
    held: false,
    attempt: 0,
    savedAt,
    theirs: null,
    blocked: null,
  }
}

// 2 s, 4 s, 8 s, 16 s, then every 30 s.
export function retryDelay(attempt: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempt - 1), 30_000)
}

// A retry keeps CHOOSE_MINE's keepCurrent: theirs must still be kept as a
// version before mine replaces it.
function send(state: AutosaveState, keepCurrent = state.keepCurrent): AutosaveState {
  return { ...state, status: 'saving', request: state.request + 1, keepCurrent, held: false }
}

export function autosave(state: AutosaveState, event: AutosaveEvent): AutosaveState {
  switch (event.type) {
    case 'EDIT': {
      const next = state.blocked ? { ...state, blocked: null } : state
      if (state.status === 'saved') return { ...next, status: 'dirty' }
      if (state.status === 'saving') return { ...next, status: 'savingDirty' }
      return next
    }

    case 'QUIET':
    case 'MAX':
    case 'FLUSH':
      if (state.blocked) return state
      if (state.status === 'dirty' || (event.type === 'FLUSH' && state.status === 'retrying')) {
        return state.composing ? { ...state, held: true } : send(state)
      }
      return state

    case 'COMPOSITION_START':
      return { ...state, composing: true }

    case 'COMPOSITION_END': {
      const next = { ...state, composing: false }
      return state.held && (state.status === 'dirty' || state.status === 'retrying') ? send(next) : { ...next, held: false }
    }

    case 'SAVE_OK':
      if (state.status === 'saving') {
        return { ...state, status: 'saved', version: event.version, savedAt: event.savedAt, attempt: 0, keepCurrent: null }
      }
      if (state.status === 'savingDirty') {
        // Typed while saving: send the newer text, based on the new version
        // (held until compositionend if a word is still being converted).
        const next = { ...state, version: event.version, savedAt: event.savedAt, attempt: 0, keepCurrent: null }
        return state.composing ? { ...next, status: 'dirty', held: true } : send(next)
      }
      return state

    case 'SAVE_FAIL':
      if (state.status === 'saving' || state.status === 'savingDirty') {
        return { ...state, status: 'retrying', attempt: state.attempt + 1 }
      }
      return state

    case 'SAVE_REJECTED':
      if (state.status === 'saving' || state.status === 'savingDirty') {
        return { ...state, status: 'dirty', blocked: event.reason, held: false, attempt: 0 }
      }
      return state

    case 'OPEN_CONFLICT':
      if (state.status !== 'saved') return state
      return { ...state, status: 'conflict', theirs: event.theirs }

    case 'RETRY':
    case 'ONLINE':
      if (state.status !== 'retrying') return state
      return state.composing ? { ...state, held: true } : send(state)

    case 'SAVE_CONFLICT':
      if (state.status === 'saving' || state.status === 'savingDirty') {
        return { ...state, status: 'conflict', theirs: event.theirs, attempt: 0, keepCurrent: null, held: false }
      }
      return state

    case 'CHOOSE_MINE':
      if (state.status !== 'conflict' || !state.theirs) return state
      return send({ ...state, version: state.theirs.version, theirs: null }, 'conflict')

    case 'THEIRS_LOADED':
      if (state.status !== 'conflict') return state
      return { ...state, status: 'saved', version: event.version, savedAt: event.savedAt, theirs: null }

    case 'LOADED':
      return { ...initialAutosave(event.version, event.savedAt), request: state.request, composing: state.composing }
  }
}

// Whether something typed isn't on the server yet (the "leave page?" prompt,
// the sign-out warning).
export function hasUnsaved(status: SaveStatus): boolean {
  return status !== 'saved'
}
