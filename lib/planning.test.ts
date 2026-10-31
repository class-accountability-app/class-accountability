import { describe, expect, it } from 'vitest'
import { canAddDependency, isMilestoneInput, nextMilestone, waitingOn } from './planning'

const tasks = [
  { id: 'a', title: 'Research', status: 'done' as const },
  { id: 'b', title: 'Slides', status: 'doing' as const },
  { id: 'c', title: 'Script', status: 'todo' as const },
]

describe('waitingOn', () => {
  it('lists only unfinished prerequisites', () => {
    const deps = [
      { task_id: 'c', depends_on: 'a' },
      { task_id: 'c', depends_on: 'b' },
    ]
    expect(waitingOn('c', deps, tasks).map((x) => x.id)).toEqual(['b'])
    expect(waitingOn('b', deps, tasks)).toEqual([])
  })
})

describe('canAddDependency', () => {
  it('refuses itself and duplicates', () => {
    expect(canAddDependency('a', 'a', [])).toBe(false)
    expect(canAddDependency('b', 'a', [{ task_id: 'b', depends_on: 'a' }])).toBe(false)
  })
  it('refuses loops of any length', () => {
    const deps = [
      { task_id: 'b', depends_on: 'a' },
      { task_id: 'c', depends_on: 'b' },
    ]
    expect(canAddDependency('a', 'b', deps)).toBe(false)
    expect(canAddDependency('a', 'c', deps)).toBe(false)
    expect(canAddDependency('c', 'a', deps)).toBe(true)
  })
})

describe('nextMilestone', () => {
  const ms = [
    { id: '1', title: 'Outline', due: '2026-11-10', target_percent: 25 },
    { id: '2', title: 'Draft', due: '2026-11-30', target_percent: 60 },
  ]
  it('picks the first one due today or later', () => {
    expect(nextMilestone(ms, 30, '2026-11-10')).toEqual({ milestone: ms[0], reached: true, gap: 0 })
    expect(nextMilestone(ms, 30, '2026-11-11')).toEqual({ milestone: ms[1], reached: false, gap: 30 })
  })
  it('is null when all are past', () => {
    expect(nextMilestone(ms, 0, '2026-12-01')).toBeNull()
  })
})

describe('isMilestoneInput', () => {
  it('checks title, day and percent', () => {
    expect(isMilestoneInput(' Outline ', '2026-11-10', 25)).toBe(true)
    expect(isMilestoneInput('  ', '2026-11-10', 25)).toBe(false)
    expect(isMilestoneInput('x'.repeat(61), '2026-11-10', 25)).toBe(false)
    expect(isMilestoneInput('Outline', '11/10', 25)).toBe(false)
    expect(isMilestoneInput('Outline', '2026-11-10', 0)).toBe(false)
    expect(isMilestoneInput('Outline', '2026-11-10', 100.5)).toBe(false)
  })
})
