import { describe, expect, it } from 'vitest'
import { latestCheckins, visibleTotal, type CheckinRow } from './project-board'

const row = (userId: string, roundStart: string, createdAt: string, snapshot: unknown): CheckinRow => ({
  userId,
  roundStart,
  createdAt,
  snapshot,
})

describe('latestCheckins', () => {
  it('keeps each member’s latest round', () => {
    const latest = latestCheckins([
      row('sato', '2026-10-01', '2026-10-02T01:00:00Z', [{ task_id: 't1', metric: 'count', total: 2, status: 'doing' }]),
      row('sato', '2026-10-05', '2026-10-06T01:00:00Z', [{ task_id: 't1', metric: 'count', total: 6, status: 'doing' }]),
      row('tanaka', '2026-10-01', '2026-10-03T01:00:00Z', []),
    ])
    expect(latest.get('sato')?.roundStart).toBe('2026-10-05')
    expect(latest.get('sato')?.items.get('t1')?.total).toBe(6)
    expect(latest.get('tanaka')?.items.size).toBe(0)
  })

  it('reads numeric strings and skips malformed items', () => {
    const latest = latestCheckins([
      row('sato', '2026-10-05', 'x', [{ task_id: 't1', metric: 'count', total: '4', status: 'doing' }, null, { title: 'no id' }]),
      row('aki', '2026-10-05', 'x', 'not an array'),
    ])
    expect(latest.get('sato')?.items.get('t1')?.total).toBe(4)
    expect(latest.get('sato')?.items.size).toBe(1)
    expect(latest.get('aki')?.items.size).toBe(0)
  })
})

describe('visibleTotal', () => {
  const latest = latestCheckins([
    row('sato', '2026-10-05', 'x', [{ task_id: 'slides', metric: 'count', total: 4, status: 'doing' }]),
  ])
  const live = new Map([['mine', 1600], ['slides', 9]])

  it('shows my own total live', () => {
    expect(visibleTotal({ id: 'mine', ownerId: 'aki', metric: 'characters' }, 'aki', live, latest)).toEqual({
      total: 1600,
      asOf: null,
      live: true,
    })
  })

  it('shows a teammate only what their last check-in shared, never the live number', () => {
    expect(visibleTotal({ id: 'slides', ownerId: 'sato', metric: 'count' }, 'aki', live, latest)).toEqual({
      total: 4,
      asOf: '2026-10-05',
      live: false,
    })
  })

  it('shows nothing for a teammate who hasn’t checked in, a status task or an unowned task', () => {
    const none = { total: null, asOf: null, live: false }
    expect(visibleTotal({ id: 'x', ownerId: 'tanaka', metric: 'count' }, 'aki', live, latest)).toEqual(none)
    expect(visibleTotal({ id: 'mine', ownerId: 'aki', metric: 'status' }, 'aki', live, latest)).toEqual(none)
    expect(visibleTotal({ id: 'y', ownerId: null, metric: 'count' }, 'aki', live, latest)).toEqual(none)
  })
})
