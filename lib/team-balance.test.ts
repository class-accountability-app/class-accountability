import { describe, expect, it } from 'vitest'
import { imbalance, openLoads } from './team-balance'

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
