import { describe, expect, it } from 'vitest'
import {
  projectStepHref,
  afterJoinHref,
  isClassId,
  joinCodeFromNext,
  podStepHref,
  startStepRedirect,
  startsFirstRun,
} from './first-run'

const CLASS = '3f1c2b4a-0d5e-4c6f-8a7b-9c0d1e2f3a4b'
const none = { studentMemberships: 0, pods: 0 }

describe('startsFirstRun: only a student with nothing yet', () => {
  it('a brand-new student → yes', () => {
    expect(startsFirstRun(none)).toBe(true)
  })

  it.each([
    ['already in a class (e.g. 23l1204, who joined earlier)', { ...none, studentMemberships: 1 }],
    ['is in a pod somewhere', { ...none, pods: 1 }],
    ['has both (a regular student)', { studentMemberships: 2, pods: 1 }],
  ])('%s → no', (_label, facts) => {
    expect(startsFirstRun(facts)).toBe(false)
  })
})

describe('afterJoinHref', () => {
  it('a student’s first class → the pod step', () => {
    expect(afterJoinHref(none, CLASS, 'student')).toBe(`/start/pod?class=${CLASS}`)
  })

  it('anyone else joining another class → the class page, as before', () => {
    expect(afterJoinHref({ studentMemberships: 1, pods: 1 }, CLASS, 'student')).toBe(`/classes/${CLASS}`)
    expect(afterJoinHref({ studentMemberships: 1, pods: 0 }, CLASS, 'student')).toBe(`/classes/${CLASS}`)
  })

  it('an organizer opening their own class’s link never enters the flow', () => {
    // They have no student membership and no team, so by the counts
    // alone they look brand new; the role is what keeps them out.
    expect(startsFirstRun(none)).toBe(true)
    expect(afterJoinHref(none, CLASS, 'organizer')).toBe(`/classes/${CLASS}`)
  })

  it('a role that could not be read means the class page, never the flow', () => {
    expect(afterJoinHref(none, CLASS, null)).toBe(`/classes/${CLASS}`)
  })
})

describe('startStepRedirect: what /start/pod does when opened directly', () => {
  const student = { role: 'student' as const, inPod: false }

  it('a new student sees the step', () => {
    expect(startStepRedirect(student, CLASS)).toBeNull()
  })

  it('an organizer of the class, or someone not in it → Home', () => {
    expect(startStepRedirect({ ...student, role: 'organizer' }, CLASS)).toBe('/')
    expect(startStepRedirect({ ...student, role: null }, CLASS)).toBe('/')
  })

  it('already in a team → the project', () => {
    expect(startStepRedirect({ ...student, inPod: true }, CLASS)).toBe(projectStepHref(CLASS))
    expect(projectStepHref(CLASS)).toBe(`/classes/${CLASS}/project`)
  })
})

describe('step links', () => {
  it('point at /start/pod with the class', () => {
    expect(podStepHref(CLASS)).toBe(`/start/pod?class=${CLASS}`)
  })
})

describe('isClassId', () => {
  it('accepts a uuid and nothing else', () => {
    expect(isClassId(CLASS)).toBe(true)
    expect(isClassId('')).toBe(false)
    expect(isClassId(`${CLASS}/../x`)).toBe(false)
    expect(isClassId(undefined)).toBe(false)
    expect(isClassId(['a'])).toBe(false)
  })
})

describe('joinCodeFromNext', () => {
  it('reads the code out of /join/{code}', () => {
    expect(joinCodeFromNext('/join/K7M3Q9TX')).toBe('K7M3Q9TX')
    expect(joinCodeFromNext('/join/K7M3Q9TX?utm=x')).toBe('K7M3Q9TX')
  })

  it('is null for any other page or a malformed escape', () => {
    expect(joinCodeFromNext('/')).toBeNull()
    expect(joinCodeFromNext('/classes/abc')).toBeNull()
    expect(joinCodeFromNext('/join/')).toBeNull()
    expect(joinCodeFromNext('/join/%E0%A4%A')).toBeNull()
    expect(joinCodeFromNext(null)).toBeNull()
    expect(joinCodeFromNext('https://evil.example/join/ABCDEFGH')).toBeNull()
  })
})
