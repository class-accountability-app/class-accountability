import { describe, expect, it } from 'vitest'
import { checkTask, isTaskMetric, isTaskStatus, TITLE_MAX, UNIT_MAX, type TaskInput, parseWholeAmount } from './tasks'

const base: TaskInput = { title: 'Slides', metric: 'count', unit: 'slides', targetAmount: 12, inputMode: 'manual' }

describe('checkTask', () => {
  it('trims the title and unit', () => {
    const r = checkTask({ ...base, title: '  Slides  ', unit: ' slides ' })
    expect(r).toEqual({
      ok: true,
      value: { title: 'Slides', metric: 'count', unit: 'slides', targetAmount: 12, inputMode: 'manual' },
    })
  })

  it('needs a title, at most TITLE_MAX code points', () => {
    expect(checkTask({ ...base, title: '   ' })).toEqual({ ok: false, problem: 'titleRequired' })
    expect(checkTask({ ...base, title: 'あ'.repeat(TITLE_MAX) }).ok).toBe(true)
    expect(checkTask({ ...base, title: 'あ'.repeat(TITLE_MAX + 1) })).toEqual({ ok: false, problem: 'titleTooLong' })
  })

  it('counts an emoji as one code point, like the database', () => {
    expect(checkTask({ ...base, title: '😀'.repeat(TITLE_MAX) }).ok).toBe(true)
  })

  it('a count task needs a unit within UNIT_MAX', () => {
    expect(checkTask({ ...base, unit: ' ' })).toEqual({ ok: false, problem: 'unitRequired' })
    expect(checkTask({ ...base, unit: 'x'.repeat(UNIT_MAX + 1) })).toEqual({ ok: false, problem: 'unitTooLong' })
  })

  it('drops the unit and goal of a status task', () => {
    const r = checkTask({ title: 'Book room', metric: 'status', unit: 'junk', targetAmount: 5, inputMode: 'manual' })
    expect(r).toEqual({
      ok: true,
      value: { title: 'Book room', metric: 'status', unit: null, targetAmount: null, inputMode: 'manual' },
    })
  })

  it('a characters task has no unit', () => {
    const r = checkTask({ title: 'Essay', metric: 'characters', unit: 'junk', targetAmount: 2000, inputMode: 'document' })
    expect(r).toEqual({
      ok: true,
      value: { title: 'Essay', metric: 'characters', unit: null, targetAmount: 2000, inputMode: 'document' },
    })
  })

  it('the goal is optional but must be positive and finite', () => {
    expect(checkTask({ ...base, targetAmount: null }).ok).toBe(true)
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(checkTask({ ...base, targetAmount: bad })).toEqual({ ok: false, problem: 'amountInvalid' })
    }
  })

  it('writing in Study Pods needs the characters metric', () => {
    expect(checkTask({ ...base, inputMode: 'document' })).toEqual({ ok: false, problem: 'documentNeedsCharacters' })
  })
})

describe('type guards', () => {
  it('accept only known values', () => {
    expect(isTaskMetric('count')).toBe(true)
    expect(isTaskMetric('hours')).toBe(false)
    expect(isTaskMetric(undefined)).toBe(false)
    expect(isTaskStatus('doing')).toBe(true)
    expect(isTaskStatus('Done')).toBe(false)
  })
})

describe('parseWholeAmount', () => {
  it('reads plain, full-width and comma-separated whole numbers', () => {
    expect(parseWholeAmount('6')).toBe(6)
    expect(parseWholeAmount('２４００')).toBe(2400)
    expect(parseWholeAmount(' 2,400 ')).toBe(2400)
  })

  it('refuses zero, negatives, decimals and anything else', () => {
    for (const raw of ['', '0', '-3', '1.5', '1e3', 'abc', '99999999999999999999']) {
      expect(parseWholeAmount(raw)).toBeNull()
    }
  })
})
