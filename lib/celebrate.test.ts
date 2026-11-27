import { describe, expect, it } from 'vitest'
import { reachedTarget } from './celebrate'

describe('reachedTarget', () => {
  it('is true only on the step that crosses the target', () => {
    expect(reachedTarget(4, 10, 10)).toBe(true)
    expect(reachedTarget(9, 12, 10)).toBe(true)
    expect(reachedTarget(0, 10, 10)).toBe(true)
  })

  it('is false below the target, or once already past it', () => {
    expect(reachedTarget(2, 9, 10)).toBe(false)
    expect(reachedTarget(10, 13, 10)).toBe(false)
    expect(reachedTarget(12, 15, 10)).toBe(false)
  })

  it('is false without a target', () => {
    expect(reachedTarget(0, 500, null)).toBe(false)
    expect(reachedTarget(0, 5, 0)).toBe(false)
  })
})
