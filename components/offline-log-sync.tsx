'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { readQueue, removeQueued, sortQueue } from '@/lib/offline-log'
import { logTaskProgress } from '@/app/classes/[classId]/project/actions'

// Sends ＋記録 entries saved while offline (lib/offline-log.ts): when the app
// opens, when the connection comes back, and right after one is queued if the
// browser thinks it is online. Root layout, signed in only.
export function OfflineLogSync({ userId }: { userId: string }) {
  const router = useRouter()
  const running = useRef(false)

  useEffect(() => {
    async function flush() {
      if (running.current || !navigator.onLine) return
      running.current = true
      let sent = 0
      try {
        const { send, drop } = sortQueue(await readQueue(), userId, Date.now())
        for (const entry of drop) await removeQueued(entry.clientId)
        for (const entry of send) {
          try {
            await logTaskProgress(entry.classId, entry.taskId, {
              amount: entry.amount,
              note: entry.note,
              clientId: entry.clientId,
            })
          } catch {
            // Still no connection: keep the rest for the next try.
            break
          }
          // Saved, or refused for good (not my task any more, project
          // finished): either way it never needs sending again.
          await removeQueued(entry.clientId)
          sent++
        }
      } finally {
        running.current = false
      }
      if (sent > 0) router.refresh()
    }

    void flush()
    window.addEventListener('online', flush)
    window.addEventListener('offline-log-queued', flush)
    return () => {
      window.removeEventListener('online', flush)
      window.removeEventListener('offline-log-queued', flush)
    }
  }, [userId, router])

  return null
}
