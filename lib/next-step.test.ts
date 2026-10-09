import { describe, expect, it } from 'vitest'
import { loggedOnTokyoDay, nextStep, type NextStepClass, type NextStepTarget } from './next-step'

// Instants are written in UTC; comments give the Tokyo (UTC+9) wall time.
const now = new Date('2026-10-02T03:00:00Z') // Fri 2 Oct 12:00 JST

const cls = (id: string, over: Partial<NextStepClass> = {}): NextStepClass => ({
  id,
  name: `Class ${id}`,
  organizer: false,
  podSize: 2,
  invited: false,
  ...over,
})

const target = (id: string, classId: string, over: Partial<NextStepTarget> = {}): NextStepTarget => ({
  id,
  classId,
  title: `Target ${id}`,
  type: 'character_count',
  targetAmount: 1000,
  deadline: '2026-10-09',
  createdAt: '2026-09-01T00:00:00Z',
  total: 0,
  inputMode: 'manual',
  ...over,
})

describe('nextStep: the seven states', () => {
  it('1: in no class → join', () => {
    expect(nextStep({ classes: [], targets: [], loggedToday: false, now })).toEqual({ kind: 'join' })
  })

  it('2: in a class with no pod → start a pod there', () => {
    expect(nextStep({ classes: [cls('A', { podSize: null })], targets: [], loggedToday: false, now })).toEqual({
      kind: 'pod',
      classId: 'A',
      className: 'Class A',
    })
  })

  it('2′: invited to a pod → see the invitation first', () => {
    expect(
      nextStep({ classes: [cls('A', { podSize: null, invited: true })], targets: [], loggedToday: false, now })
    ).toMatchObject({ kind: 'invitation', classId: 'A' })
  })

  it('3: in a pod, no target → first target in that class', () => {
    expect(nextStep({ classes: [cls('A')], targets: [], loggedToday: false, now })).toMatchObject({
      kind: 'firstTarget',
      classId: 'A',
    })
  })

  it('4: targets, nothing logged today → log the most urgent one', () => {
    const step = nextStep({
      classes: [cls('A')],
      targets: [
        target('later', 'A', { deadline: '2026-10-20', total: 100 }),
        target('soon', 'A', { deadline: '2026-10-04', total: 600 }),
      ],
      loggedToday: false,
      now,
    })
    expect(step).toMatchObject({ kind: 'logToday', classId: 'A', remaining: 400, daysLeft: 2 })
    expect(step.kind === 'logToday' && step.target.id).toBe('soon')
  })

  it('4: a task as the most urgent target has no amount left', () => {
    const step = nextStep({
      classes: [cls('A')],
      targets: [target('t', 'A', { type: 'task', targetAmount: null, deadline: '2026-10-03' })],
      loggedToday: false,
      now,
    })
    expect(step).toMatchObject({ kind: 'logToday', remaining: null, daysLeft: 1 })
  })

  it('5: logged today → see the pod', () => {
    expect(
      nextStep({ classes: [cls('A')], targets: [target('x', 'A', { total: 10 })], loggedToday: true, now })
    ).toEqual({ kind: 'seePod', classId: 'A', className: 'Class A' })
  })

  it('6: every target finished → next target', () => {
    expect(
      nextStep({
        classes: [cls('A')],
        targets: [target('x', 'A', { total: 1000 }), target('t', 'A', { type: 'task', targetAmount: null, total: 1 })],
        loggedToday: false,
        now,
      })
    ).toMatchObject({ kind: 'nextTarget', classId: 'A' })
  })

  it('7: organizer only → share the join link', () => {
    expect(
      nextStep({ classes: [cls('O', { organizer: true, podSize: null })], targets: [], loggedToday: false, now })
    ).toEqual({ kind: 'share', classId: 'O', className: 'Class O' })
  })
})

describe('nextStep: 「Study Pods で書く」', () => {
  it('the most urgent target is a document → keep writing', () => {
    const step = nextStep({
      classes: [cls('A')],
      targets: [target('doc', 'A', { inputMode: 'document', deadline: '2026-10-04' }), target('later', 'A')],
      loggedToday: false,
      now,
    })
    expect(step).toMatchObject({ kind: 'logToday', write: true, target: { id: 'doc' }, remaining: 1000, daysLeft: 2 })
  })

  it('a document that isn’t the most urgent → log today as usual', () => {
    const step = nextStep({
      classes: [cls('A')],
      targets: [target('doc', 'A', { inputMode: 'document' }), target('soon', 'A', { deadline: '2026-10-03' })],
      loggedToday: false,
      now,
    })
    expect(step).toMatchObject({ kind: 'logToday', write: false, target: { id: 'soon' } })
  })

  it('writing today counts as logging today', () => {
    expect(
      nextStep({ classes: [cls('A')], targets: [target('doc', 'A', { inputMode: 'document' })], loggedToday: true, now })
    ).toMatchObject({ kind: 'seePod' })
  })
})

describe('nextStep: edge cases', () => {
  it('a pod with only me, after logging today → invite classmates', () => {
    expect(
      nextStep({ classes: [cls('A', { podSize: 1 })], targets: [target('x', 'A')], loggedToday: true, now })
    ).toMatchObject({ kind: 'invite', classId: 'A' })
  })

  it('a pod with only me and no target → the target comes first', () => {
    expect(nextStep({ classes: [cls('A', { podSize: 1 })], targets: [], loggedToday: false, now })).toMatchObject({
      kind: 'firstTarget',
    })
  })

  it('a pod with only me, not logged today → log first', () => {
    expect(
      nextStep({ classes: [cls('A', { podSize: 1 })], targets: [target('x', 'A')], loggedToday: false, now })
    ).toMatchObject({ kind: 'logToday' })
  })

  it('several classes: the one furthest behind wins (no pod beats no target)', () => {
    const step = nextStep({
      classes: [cls('A'), cls('B', { podSize: null }), cls('C')],
      targets: [target('x', 'A')],
      loggedToday: false,
      now,
    })
    expect(step).toMatchObject({ kind: 'pod', classId: 'B' })
  })

  it('several classes: a class with a pod but no target, before logging elsewhere', () => {
    expect(
      nextStep({ classes: [cls('A'), cls('B')], targets: [target('x', 'A')], loggedToday: false, now })
    ).toMatchObject({ kind: 'firstTarget', classId: 'B' })
  })

  it('several classes: log the most urgent target across classes', () => {
    const step = nextStep({
      classes: [cls('A'), cls('B')],
      targets: [target('a', 'A', { deadline: '2026-10-30' }), target('b', 'B', { deadline: '2026-10-05' })],
      loggedToday: false,
      now,
    })
    expect(step).toMatchObject({ kind: 'logToday', classId: 'B' })
  })

  it('a student who also organizes another class: the student step wins', () => {
    expect(
      nextStep({
        classes: [cls('O', { organizer: true, podSize: null }), cls('A', { podSize: null })],
        targets: [],
        loggedToday: false,
        now,
      })
    ).toMatchObject({ kind: 'pod', classId: 'A' })
  })

  it('finished targets don\'t count as open; the open one is logged', () => {
    expect(
      nextStep({
        classes: [cls('A')],
        targets: [target('done', 'A', { total: 1000, deadline: '2026-10-03' }), target('open', 'A')],
        loggedToday: false,
        now,
      })
    ).toMatchObject({ kind: 'logToday', target: { id: 'open' } })
  })

  it('a deadline that has passed still gets logged (days left is negative)', () => {
    expect(
      nextStep({ classes: [cls('A')], targets: [target('x', 'A', { deadline: '2026-09-30' })], loggedToday: false, now })
    ).toMatchObject({ kind: 'logToday', daysLeft: -2 })
  })
})

describe('loggedOnTokyoDay', () => {
  it('uses the Tokyo day, not UTC', () => {
    const justAfterMidnight = new Date('2026-10-01T15:30:00Z') // 2 Oct 00:30 JST
    expect(loggedOnTokyoDay(['2026-10-01T15:10:00Z'], justAfterMidnight)).toBe(true) // 00:10 JST same day
    expect(loggedOnTokyoDay(['2026-10-01T14:50:00Z'], justAfterMidnight)).toBe(false) // 23:50 JST yesterday
    expect(loggedOnTokyoDay([], justAfterMidnight)).toBe(false)
  })
})
