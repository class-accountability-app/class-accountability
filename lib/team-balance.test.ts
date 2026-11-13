import { describe, expect, it } from 'vitest'
import { imbalance, openLoads, shareOut } from './team-balance'

describe('team balance', () => {
  const tasks = [
    { owner_id: 'aki', status: 'doing' },
    { owner_id: 'aki', status: 'todo' },
    { owner_id: 'aki', status: 'todo' },
    { owner_id: 'aki', status: 'done' },
    { owner_id: 'sato', status: 'done' },
    { owner_id: null, status: 'todo' },
  ]

  it('counts open tasks per member, done ones left out', () => {
    expect(openLoads(['aki', 'sato'], tasks)).toEqual([
      { id: 'aki', open: 3 },
      { id: 'sato', open: 0 },
    ])
  })

  it('flags a gap of 3 or more', () => {
    expect(imbalance(openLoads(['aki', 'sato'], tasks))).toEqual({ heavy: { id: 'aki', open: 3 }, light: { id: 'sato', open: 0 } })
  })

  it('stays quiet for small gaps and teams of one', () => {
    expect(imbalance([{ id: 'a', open: 2 }, { id: 'b', open: 0 }])).toBeNull()
    expect(imbalance([{ id: 'a', open: 5 }])).toBeNull()
  })
})

describe('shareOut', () => {
  it('gives each task to whoever has the fewest open tasks, earlier member on a tie', () => {
    const loads = [
      { id: 'a', open: 2 },
      { id: 'b', open: 0 },
      { id: 'c', open: 1 },
    ]
    expect(shareOut(['t1', 't2', 't3', 't4'], loads)).toEqual([
      { taskId: 't1', ownerId: 'b' }, // b 0 → 1
      { taskId: 't2', ownerId: 'b' }, // b and c at 1: b is earlier → 2
      { taskId: 't3', ownerId: 'c' }, // c 1 → 2
      { taskId: 't4', ownerId: 'a' }, // all at 2: a is first
    ])
  })
  it('leaves the given loads untouched and handles no members or no tasks', () => {
    const loads = [{ id: 'a', open: 0 }]
    shareOut(['t1'], loads)
    expect(loads[0].open).toBe(0)
    expect(shareOut(['t1'], [])).toEqual([])
    expect(shareOut([], loads)).toEqual([])
  })
})
