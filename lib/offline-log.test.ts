import { describe, expect, it } from 'vitest'
import { QUEUE_MAX_AGE_MS, isOffline, sortQueue, type QueuedLog } from './offline-log'

const entry = (over: Partial<QueuedLog>): QueuedLog => ({
  clientId: 'c',
  userId: 'me',
  classId: 'k',
  taskId: 't',
  amount: '3',
  note: '',
  queuedAt: 1000,
  ...over,
})

describe('sortQueue', () => {
  it('sends my recent entries oldest first and drops the rest', () => {
    const now = 10_000
    const a = entry({ clientId: 'a', queuedAt: 3000 })
    const b = entry({ clientId: 'b', queuedAt: 2000 })
    const other = entry({ clientId: 'o', userId: 'someone-else' })
    const old = entry({ clientId: 'x', queuedAt: now - QUEUE_MAX_AGE_MS - 1 })
    const { send, drop } = sortQueue([a, b, other, old], 'me', now)
    expect(send.map((e) => e.clientId)).toEqual(['b', 'a'])
    expect(drop.map((e) => e.clientId).sort()).toEqual(['o', 'x'])
  })
})

describe('isOffline', () => {
  it('is true only when the browser says so', () => {
    expect(isOffline({ onLine: false })).toBe(true)
    expect(isOffline({ onLine: true })).toBe(false)
    expect(isOffline(undefined)).toBe(false)
  })
})
