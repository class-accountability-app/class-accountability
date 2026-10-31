// ＋記録 without a connection (feature batch 3). When the phone is offline,
// the entry waits in this browser's IndexedDB and is sent when the connection
// comes back or the app is opened again (components/offline-log-sync.tsx).
// Each entry keeps the client id made when the form opened, so sending it
// twice saves it once (0022's unique (user_id, client_id), as in 0014).
// The server stamps the time it arrives, not the time it was typed.
// Sign-out, /login and account deletion clear the queue, like the editor's
// drafts (lib/local-draft.ts); entries older than 7 days or another
// student's are dropped.

export type QueuedLog = {
  clientId: string
  userId: string
  classId: string
  taskId: string
  amount: string
  note: string
  queuedAt: number
}

export const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Which entries to send now and which to throw away.
export function sortQueue(all: QueuedLog[], userId: string, now: number): { send: QueuedLog[]; drop: QueuedLog[] } {
  const send: QueuedLog[] = []
  const drop: QueuedLog[] = []
  for (const entry of all) {
    if (entry.userId !== userId || now - entry.queuedAt > QUEUE_MAX_AGE_MS) drop.push(entry)
    else send.push(entry)
  }
  send.sort((a, b) => a.queuedAt - b.queuedAt)
  return { send, drop }
}

// The browser knows it has no connection: queue without trying.
export function isOffline(nav: { onLine: boolean } | undefined): boolean {
  return nav !== undefined && nav.onLine === false
}

// ── IndexedDB (browser only) ────────────────────────────────────────────────

const DB_NAME = 'study-pods-offline'
const STORE = 'logs'

function available(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'clientId' })
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

// Set by sign-out and account deletion, so nothing is queued again on a page
// that is going away.
let sealed = false

export async function queueLog(entry: QueuedLog): Promise<boolean> {
  if (!available() || sealed) return false
  try {
    await withStore('readwrite', (s) => s.put(entry))
    window.dispatchEvent(new Event('offline-log-queued'))
    return true
  } catch {
    return false
  }
}

export async function readQueue(): Promise<QueuedLog[]> {
  if (!available()) return []
  try {
    return (await withStore('readonly', (s) => s.getAll())) as QueuedLog[]
  } catch {
    return []
  }
}

export async function removeQueued(clientId: string): Promise<void> {
  if (!available()) return
  try {
    await withStore('readwrite', (s) => s.delete(clientId))
  } catch {
    // Sent again next time; the client id keeps it to one entry.
  }
}

export async function hasQueuedLogs(): Promise<boolean> {
  if (!available()) return false
  try {
    return (await withStore('readonly', (s) => s.count())) > 0
  } catch {
    return false
  }
}

export async function clearQueue({ seal = false }: { seal?: boolean } = {}): Promise<void> {
  if (seal) sealed = true
  if (!available()) return
  try {
    await withStore('readwrite', (s) => s.clear())
  } catch {
    // The browser refused storage, so nothing was kept.
  }
}
