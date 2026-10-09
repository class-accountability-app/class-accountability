import type { JSONContent } from '@tiptap/core'

// Unsaved changes in the editor (Prompt 12), kept in this browser's
// IndexedDB so a closed tab, a crash or a lost connection never loses typing.
// One draft per student and target, key `userId:targetId`. A draft is
// deleted once the server has the same text; drafts older than 7 days are
// dropped; sign-out, /login and account deletion wipe them all (clearAll).
// Nothing here is ever sent anywhere: the server only gets what autosave
// saves.

export type LocalDraft = {
  userId: string
  targetId: string
  content: JSONContent
  // The server version the draft was typed on.
  baseVersion: number
  // Every edit goes up by one; a save deletes the draft only if no newer
  // edit arrived meanwhile.
  rev: number
  // Date.now() of the last edit.
  editedAt: number
}

export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function draftKey(userId: string, targetId: string): string {
  return `${userId}:${targetId}`
}

export type DraftDecision =
  // Nothing to offer: no draft, or it is the same text as the server's.
  | { kind: 'none'; discard: boolean }
  // Typed on the version the server still has, not saved: offer it back.
  | { kind: 'offer'; draft: LocalDraft }
  // Typed on an older version, and the server moved on since (another tab or
  // device): the conflict choice.
  | { kind: 'conflict'; draft: LocalDraft }

// On opening the editor: what to do with the draft found for this target.
// `discard` means delete it.
export function decideDraft(
  draft: LocalDraft | null,
  server: { userId: string; version: number; content: JSONContent },
  now: number
): DraftDecision {
  if (!draft) return { kind: 'none', discard: false }
  if (draft.userId !== server.userId) return { kind: 'none', discard: true }
  if (now - draft.editedAt > DRAFT_MAX_AGE_MS) return { kind: 'none', discard: true }
  if (sameContent(draft.content, server.content)) return { kind: 'none', discard: true }
  if (draft.baseVersion === server.version) return { kind: 'offer', draft }
  if (draft.baseVersion < server.version) return { kind: 'conflict', draft }
  // A base newer than the server's can only be a draft from a deleted and
  // recreated target, or a tampered one: not ours to offer.
  return { kind: 'none', discard: true }
}

// Key order is stable: both sides come from ProseMirror's toJSON.
export function sameContent(a: JSONContent, b: JSONContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── IndexedDB (browser only) ────────────────────────────────────────────────

const DB_NAME = 'study-pods'
const STORE = 'drafts'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('blocked'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// Set by sign-out and account deletion: the page is about to go away, and
// the editor's pagehide/beforeunload handlers must not write the draft back
// after it was cleared (found in the dev test). Lasts for this page only.
let sealed = false

export function draftsSealed(): boolean {
  return sealed
}

// Private windows and some in-app browsers have no IndexedDB, or refuse it.
// The editor still works there; only the safety net is missing.
function available(): boolean {
  return typeof indexedDB !== 'undefined'
}

export async function readDraft(userId: string, targetId: string): Promise<LocalDraft | null> {
  if (!available()) return null
  try {
    return ((await withStore('readonly', (s) => s.get(draftKey(userId, targetId)))) as LocalDraft | undefined) ?? null
  } catch {
    return null
  }
}

export async function writeDraft(draft: LocalDraft): Promise<boolean> {
  if (!available() || sealed) return false
  try {
    await withStore('readwrite', (s) => s.put(draft, draftKey(draft.userId, draft.targetId)))
    return true
  } catch {
    return false
  }
}

export async function deleteDraft(userId: string, targetId: string, ifRev?: number): Promise<void> {
  if (!available()) return
  try {
    if (ifRev !== undefined) {
      const current = await readDraft(userId, targetId)
      if (!current || current.rev !== ifRev) return
    }
    await withStore('readwrite', (s) => s.delete(draftKey(userId, targetId)))
  } catch {
    // Left for the 7-day cleanup.
  }
}

// Every draft in this browser, whoever wrote it.
export async function hasAnyDraft(): Promise<boolean> {
  if (!available()) return false
  try {
    return (await withStore('readonly', (s) => s.count())) > 0
  } catch {
    return false
  }
}

// `seal`: for sign-out and account deletion, nothing is written again on this
// page. /login clears without sealing: the student goes on to write after
// logging in, in the same page.
export async function clearAll({ seal = false }: { seal?: boolean } = {}): Promise<void> {
  if (seal) sealed = true
  if (!available()) return
  try {
    await withStore('readwrite', (s) => s.clear())
  } catch {
    // Nothing more to do: the browser refused storage, so nothing was kept.
  }
}

// Drafts older than 7 days, and anyone else's (a shared computer whose
// previous student didn't sign out).
export async function dropStaleDrafts(userId: string, now: number): Promise<void> {
  if (!available()) return
  try {
    const all = (await withStore('readonly', (s) => s.getAll())) as LocalDraft[]
    const stale = all.filter((d) => d.userId !== userId || now - d.editedAt > DRAFT_MAX_AGE_MS)
    for (const d of stale) await withStore('readwrite', (s) => s.delete(draftKey(d.userId, d.targetId)))
  } catch {
    // Tried again next time the editor opens.
  }
}
