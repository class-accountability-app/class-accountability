import { describe, expect, it } from 'vitest'
import {
  groupTasksByOwner,
  isOverdue,
  isTaskFinished,
  projectPercent,
  taskFraction,
  taskPercent,
  type TaskLike,
} from './project-stats'

const task = (over: Partial<TaskLike> = {}): TaskLike => ({
  id: 't',
  ownerId: 'a',
  metric: 'count',
  targetAmount: 10,
  status: 'doing',
  total: 0,
  due: null,
  ...over,
})

describe('taskFraction', () => {
  it('is 1 when done, whatever the numbers', () => {
    expect(taskFraction(task({ status: 'done', total: 0 }))).toBe(1)
  })

  it('is total over goal for a counted task, capped at 1', () => {
    expect(taskFraction(task({ total: 4 }))).toBe(0.4)
    expect(taskFraction(task({ total: 25 }))).toBe(1)
    expect(taskFraction(task({ total: -3 }))).toBe(0)
  })

  it('falls back to status when there is no goal', () => {
    expect(taskFraction(task({ targetAmount: null, status: 'todo' }))).toBe(0)
    expect(taskFraction(task({ targetAmount: null, status: 'doing' }))).toBe(0.5)
    expect(taskFraction(task({ metric: 'status', targetAmount: null, status: 'doing', total: 99 }))).toBe(0.5)
  })
})

describe('taskPercent', () => {
  it('rounds to a whole percent', () => {
    expect(taskPercent(task({ targetAmount: 3, total: 1 }))).toBe(33)
  })
})

describe('isTaskFinished', () => {
  it('is true when done or the goal is reached', () => {
    expect(isTaskFinished(task({ status: 'done' }))).toBe(true)
    expect(isTaskFinished(task({ total: 10 }))).toBe(true)
    expect(isTaskFinished(task({ total: 9 }))).toBe(false)
    expect(isTaskFinished(task({ targetAmount: null, total: 100 }))).toBe(false)
  })
})

describe('projectPercent', () => {
  it('is 0 with no tasks', () => {
    expect(projectPercent([])).toBe(0)
  })

  it('weighs every task the same', () => {
    expect(projectPercent([task({ status: 'done' }), task({ total: 0 })])).toBe(50)
    expect(projectPercent([task({ status: 'done' }), task({ status: 'done' }), task({ total: 0 })])).toBe(67)
  })
})

describe('isOverdue', () => {
  const now = new Date('2026-10-10T03:00:00Z') // 10/10 12:00 JST

  it('is overdue only after the due day', () => {
    expect(isOverdue(task({ due: '2026-10-09' }), now)).toBe(true)
    expect(isOverdue(task({ due: '2026-10-10' }), now)).toBe(false)
    expect(isOverdue(task({ due: '2026-10-11' }), now)).toBe(false)
  })

  it('never for a finished task or one with no due date', () => {
    expect(isOverdue(task({ due: '2026-10-01', status: 'done' }), now)).toBe(false)
    expect(isOverdue(task({ due: null }), now)).toBe(false)
  })
})

describe('groupTasksByOwner', () => {
  const tasks = [
    task({ id: '1', ownerId: 'b' }),
    task({ id: '2', ownerId: 'a' }),
    task({ id: '3', ownerId: null }),
    task({ id: '4', ownerId: 'gone' }),
  ]

  it('puts the viewer first, then the others, then unassigned', () => {
    const groups = groupTasksByOwner(tasks, ['a', 'b', 'c'], 'b')
    expect(groups.map((g) => g.ownerId)).toEqual(['b', 'a', 'c', null])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['1'])
    expect(groups[2].tasks).toEqual([]) // a member with no tasks is still listed
    expect(groups[3].tasks.map((t) => t.id)).toEqual(['3', '4']) // an owner who left counts as unassigned
  })

  it('has no unassigned group when every task has an owner', () => {
    const groups = groupTasksByOwner([task({ ownerId: 'a' })], ['a'], 'a')
    expect(groups.map((g) => g.ownerId)).toEqual(['a'])
  })
})
