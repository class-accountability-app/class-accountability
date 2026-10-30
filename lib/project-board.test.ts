import { describe, expect, it } from 'vitest'
import { latestCheckins, snapshotItems, tidyTotal, visibleTotal, type CheckinRow } from './project-board'

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

describe('snapshotItems', () => {
  it('reads what submit_checkin stores, in order', () => {
    expect(
      snapshotItems([
        { task_id: 't1', title: 'Script', metric: 'characters', unit: null, target_amount: 2400, total: 1600, status: 'doing' },
        { task_id: 't2', title: 'Data', metric: 'status', unit: null, target_amount: null, total: null, status: 'done' },
        'junk',
      ])
    ).toEqual([
      { taskId: 't1', title: 'Script', metric: 'characters', unit: null, targetAmount: 2400, total: 1600, status: 'doing' },
      { taskId: 't2', title: 'Data', metric: 'status', unit: null, targetAmount: null, total: null, status: 'done' },
    ])
    expect(snapshotItems(null)).toEqual([])
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

  it('shows a teammate live when the pod’s totals are live (0027)', () => {
    expect(visibleTotal({ id: 'slides', ownerId: 'sato', metric: 'count' }, 'aki', live, latest, true)).toEqual({
      total: 9,
      asOf: null,
      live: true,
    })
    expect(visibleTotal({ id: 'z', ownerId: 'tanaka', metric: 'count' }, 'aki', live, latest, true)).toEqual({
      total: 0,
      asOf: null,
      live: true,
    })
    expect(visibleTotal({ id: 'y', ownerId: null, metric: 'count' }, 'aki', live, latest, true).live).toBe(false)
  })

  it('without live team totals, shows a teammate only what their last check-in shared', () => {
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

describe('tidyTotal', () => {
  it('tidies summed decimals', () => {
    expect(tidyTotal(0.1 + 0.2)).toBe(0.3)
    expect(tidyTotal(1600)).toBe(1600)
  })
})
