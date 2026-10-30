import { describe, expect, it } from 'vitest'
import { CLASS_PROJECT_PRESETS, checkClassProject, rowsFromTasks, type ClassProjectTaskRow } from './class-project'

const now = new Date('2026-10-30T01:00:00Z') // 10:00 JST
const row = (over: Partial<ClassProjectTaskRow> = {}): ClassProjectTaskRow => ({
  title: 'Slides',
  metric: 'count',
  unit: '枚',
  target: '15',
  daysBefore: '5',
  ...over,
})
const base = { title: ' 最終発表 ', deadline: '2026-12-18', every: '4', tasks: [row()] }

describe('checkClassProject', () => {
  it('trims and turns rows into the stored JSON', () => {
    const r = checkClassProject(
      { ...base, tasks: [row(), row({ title: 'Rehearsal', metric: 'status', unit: 'x', target: '9', daysBefore: '' })] },
      now
    )
    expect(r).toEqual({
      ok: true,
      value: {
        title: '最終発表',
        deadline: '2026-12-18',
        every: 4,
        tasks: [
          { title: 'Slides', metric: 'count', unit: '枚', target: 15, days_before: 5 },
          { title: 'Rehearsal', metric: 'status' },
        ],
      },
    })
  })

  it('allows no deadline and no goal; refuses a past deadline and a bad interval', () => {
    expect(checkClassProject({ ...base, deadline: '', tasks: [row({ target: '' })] }, now).ok).toBe(true)
    expect(checkClassProject({ ...base, deadline: '2026-10-29' }, now)).toMatchObject({ problem: 'deadlineInPast' })
    expect(checkClassProject({ ...base, every: '15' }, now)).toMatchObject({ problem: 'checkinEveryInvalid' })
    expect(checkClassProject({ ...base, title: '  ' }, now)).toMatchObject({ problem: 'titleRequired', taskIndex: null })
  })

  it('names the task that the database would refuse', () => {
    expect(checkClassProject({ ...base, tasks: [row(), row({ unit: '' })] }, now)).toMatchObject({
      problem: 'unitRequired',
      taskIndex: 1,
    })
    expect(checkClassProject({ ...base, tasks: [row({ target: '0' })] }, now)).toMatchObject({ problem: 'targetAmountPositive', taskIndex: 0 })
    expect(checkClassProject({ ...base, tasks: [row({ daysBefore: '-3' })] }, now)).toMatchObject({ problem: 'classProjectDaysInvalid' })
    expect(checkClassProject({ ...base, tasks: Array.from({ length: 31 }, () => row()) }, now)).toMatchObject({
      problem: 'classProjectTooManyTasks',
    })
  })

  it('accepts every preset as it is', () => {
    for (const preset of Object.values(CLASS_PROJECT_PRESETS)) {
      for (const tasks of Object.values(preset)) expect(checkClassProject({ ...base, tasks }, now).ok).toBe(true)
    }
  })
})

describe('rowsFromTasks', () => {
  it('reads the stored JSON back, skipping anything odd', () => {
    expect(rowsFromTasks([{ title: 'Slides', metric: 'count', unit: '枚', target: 15, days_before: 5 }, 'x', null])).toEqual([
      { title: 'Slides', metric: 'count', unit: '枚', target: '15', daysBefore: '5' },
    ])
    expect(rowsFromTasks('nope')).toEqual([])
  })
})
