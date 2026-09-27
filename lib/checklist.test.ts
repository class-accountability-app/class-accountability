import { describe, expect, it } from 'vitest'
import { buildChecklist, type HomeClass } from './checklist'

const stats: HomeClass = { id: 'c1', name: '統計学 201', term: '2026 秋学期', podSize: null, organizer: false }
const english: HomeClass = { id: 'c2', name: 'English II', term: '2026 秋学期', podSize: null, organizer: false }

describe('buildChecklist', () => {
  it('starts at 0 / 3 with joining a class next (by code, so no link)', () => {
    const c = buildChecklist([], false)
    expect(c.doneCount).toBe(0)
    expect(c.next).toBe('join')
    expect(c.nextHref).toBeNull()
    expect(c.joinedClassName).toBeNull()
  })

  it('after joining, the pod step opens the class without a pod', () => {
    const c = buildChecklist([stats], false)
    expect(c.doneCount).toBe(1)
    expect(c.next).toBe('pod')
    expect(c.nextHref).toBe('/classes/c1')
    expect(c.joinedClassName).toBe('統計学 201')
  })

  it('with a pod, the target step opens the new-target page of that class', () => {
    const c = buildChecklist([english, { ...stats, podSize: 3 }], false)
    expect(c.doneCount).toBe(2)
    expect(c.next).toBe('target')
    expect(c.nextHref).toBe('/classes/c1/targets/new')
  })

  it('a pod in any class counts; the first joined class is named', () => {
    const c = buildChecklist([stats, { ...english, podSize: 1 }], true)
    expect(c.allDone).toBe(true)
    expect(c.next).toBeNull()
    expect(c.nextHref).toBeNull()
    expect(c.joinedClassName).toBe('統計学 201')
  })

  it('a target without a pod still leaves the pod step next', () => {
    const c = buildChecklist([stats], true)
    expect(c.doneCount).toBe(2)
    expect(c.next).toBe('pod')
  })

  it('ignores classes you organize: an organizer-only account is still at step 1', () => {
    const c = buildChecklist([{ ...stats, organizer: true }], false)
    expect(c.doneCount).toBe(0)
    expect(c.next).toBe('join')
    expect(c.joinedClassName).toBeNull()
  })

  it('names and links the class you study in, not the one you organize', () => {
    const c = buildChecklist([{ ...english, organizer: true }, stats], false)
    expect(c.joinedClassName).toBe('統計学 201')
    expect(c.nextHref).toBe('/classes/c1')
  })
})
