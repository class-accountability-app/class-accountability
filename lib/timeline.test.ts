import { describe, expect, it } from 'vitest'
import { timelineRows } from './timeline'

describe('timelineRows', () => {
  const tasks = [
    { id: 'b', title: 'Slides', due: '2026-11-21', status: 'todo' },
    { id: 'a', title: 'Outline', due: '2026-11-06', status: 'done' },
    { id: 'c', title: 'Notes', due: '2026-11-05', status: 'doing' },
    { id: 'd', title: 'No date', due: null, status: 'todo' },
  ]

  it('orders by due date and scales to the deadline', () => {
    const { rows, todayPct } = timelineRows(tasks, '2026-11-01', '2026-12-01', '2026-11-10')
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(rows[2].endPct).toBe(67) // 20 of 30 days
    expect(todayPct).toBe(30)
  })

  it('marks late tasks (past due, not done) only', () => {
    const { rows } = timelineRows(tasks, '2026-11-01', '2026-12-01', '2026-11-10')
    expect(rows.find((r) => r.id === 'c')?.late).toBe(true)
    expect(rows.find((r) => r.id === 'a')?.late).toBe(false)
    expect(rows.find((r) => r.id === 'b')?.late).toBe(false)
  })

  it('uses the latest due date when there is no deadline, and nothing without dates', () => {
    expect(timelineRows(tasks, '2026-11-01', null, '2026-11-10').rows.at(-1)?.endPct).toBe(100)
    expect(timelineRows([tasks[3]], '2026-11-01', null, '2026-11-10')).toEqual({ rows: [], todayPct: null })
  })
})
