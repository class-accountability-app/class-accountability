import { describe, expect, it } from 'vitest'
import { filledButtons, homeLayout } from './home-layout'
import { nextStep, type NextStep, type NextStepClass, type NextStepTarget } from './next-step'

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

// What Home does for a student: the step the ranking picks, then the layout.
function home(classes: NextStepClass[], targets: NextStepTarget[], loggedToday: boolean) {
  const step = nextStep({ classes, targets, loggedToday, now })
  const hasOpenTarget = targets.some((t) => (t.type === 'task' ? t.total < 1 : t.targetAmount === null || t.total < t.targetAmount))
  return { step, layout: homeLayout(step, hasOpenTarget, loggedToday) }
}

const everyStep: NextStep[] = [
  { kind: 'join' },
  { kind: 'share', classId: 'A', className: 'A' },
  { kind: 'invitation', classId: 'A', className: 'A' },
  { kind: 'pod', classId: 'A', className: 'A' },
  { kind: 'firstTarget', classId: 'A', className: 'A' },
  { kind: 'invite', classId: 'A', className: 'A' },
  { kind: 'seePod', classId: 'A', className: 'A' },
  { kind: 'nextTarget', classId: 'A', className: 'A' },
  {
    kind: 'logToday',
    classId: 'A',
    target: target('t', 'A'),
    remaining: 1000,
    daysLeft: 7,
    write: false,
  },
]

describe('Home shows at most one filled button, in every state', () => {
  for (const step of everyStep) {
    for (const hasOpenTarget of [true, false]) {
      for (const loggedToday of [true, false]) {
        it(`${step.kind}, open target ${hasOpenTarget}, logged today ${loggedToday}`, () => {
          expect(filledButtons(homeLayout(step, hasOpenTarget, loggedToday))).toBeLessThanOrEqual(1)
        })
      }
    }
  }
})

describe('Home layout', () => {
  it('log today: no card, the hero holds the one filled button', () => {
    const { step, layout } = home([cls('A')], [target('x', 'A')], false)
    expect(step.kind).toBe('logToday')
    expect(layout).toEqual({ stepSlot: 'none', stepPrimary: false, hero: { state: 'log', primary: true } })
    expect(filledButtons(layout)).toBe(1)
  })

  it('keep writing is log today: the same hero (the hero button is 続きを書く)', () => {
    const { step, layout } = home([cls('A')], [target('doc', 'A', { inputMode: 'document' })], false)
    expect(step).toMatchObject({ kind: 'logToday', write: true })
    expect(layout.hero).toEqual({ state: 'log', primary: true })
  })

  it('a pending invitation is the card at the top and owns the filled button; the hero is outlined', () => {
    const { step, layout } = home([cls('A', { podSize: null, invited: true })], [target('x', 'A')], false)
    expect(step.kind).toBe('invitation')
    expect(layout).toEqual({ stepSlot: 'top', stepPrimary: true, hero: { state: 'log', primary: false } })
    expect(filledButtons(layout)).toBe(1)
  })

  it('a new student who left after joining: the first target, no hero yet', () => {
    const { step, layout } = home([cls('A', { podSize: null })], [], false)
    expect(step.kind).toBe('firstTarget')
    expect(layout).toEqual({ stepSlot: 'top', stepPrimary: true, hero: null })
  })

  it('skipped the pod, not logged today: log today comes first, the pod prompt does not take its place', () => {
    const { step, layout } = home([cls('A', { podSize: null })], [target('x', 'A')], false)
    expect(step.kind).toBe('logToday')
    expect(layout.stepSlot).toBe('none')
  })

  it('no pod, logged today: the pod prompt sits UNDER the hero, outlined; the hero is done and outlined too', () => {
    const { step, layout } = home([cls('A', { podSize: null })], [target('x', 'A')], true)
    expect(step.kind).toBe('pod')
    expect(layout).toEqual({ stepSlot: 'under', stepPrimary: false, hero: { state: 'done', primary: false } })
    expect(filledButtons(layout)).toBe(0)
  })

  it('all targets finished and no pod: nothing to log, so the pod prompt is the filled button', () => {
    const { step, layout } = home([cls('A', { podSize: null })], [target('x', 'A', { total: 1000 })], false)
    expect(step.kind).toBe('pod')
    expect(layout).toEqual({ stepSlot: 'under', stepPrimary: true, hero: null })
    expect(filledButtons(layout)).toBe(1)
  })

  it('all targets finished, in a pod: the next-target card is the filled button, no hero', () => {
    const { step, layout } = home([cls('A')], [target('x', 'A', { total: 1000 })], false)
    expect(step.kind).toBe('nextTarget')
    expect(layout).toEqual({ stepSlot: 'top', stepPrimary: true, hero: null })
  })

  it('in a pod, logged today: see the pod, outlined, under a done hero', () => {
    const { step, layout } = home([cls('A')], [target('x', 'A')], true)
    expect(step.kind).toBe('seePod')
    expect(layout).toEqual({ stepSlot: 'under', stepPrimary: false, hero: { state: 'done', primary: false } })
  })

  it('an organizer who only organizes: share the link, no hero, one filled button', () => {
    const { step, layout } = home([cls('O', { organizer: true, podSize: null })], [], false)
    expect(step.kind).toBe('share')
    expect(layout).toEqual({ stepSlot: 'top', stepPrimary: true, hero: null })
  })

  it('a student in no class: join, no hero', () => {
    const { step, layout } = home([], [], false)
    expect(step.kind).toBe('join')
    expect(layout.hero).toBeNull()
    expect(filledButtons(layout)).toBe(1)
  })
})

describe('existing students keep landing on Home as before', () => {
  // 23l1204 (a student who joined, maybe no pod or target yet) and 23b1808
  // (the organizer) are covered by shape, not by logging in as them. Home is
  // `/` for everyone with a chosen name; none of this routes anyone elsewhere.
  it('a student with a class but no pod and no target gets the first-target card on Home', () => {
    const { step, layout } = home([cls('A', { podSize: null })], [], false)
    expect(step).toMatchObject({ kind: 'firstTarget', classId: 'A' })
    expect(layout.stepSlot).toBe('top')
  })

  it('a regular student (pod and targets) gets the hero and no card, as the log-today step', () => {
    const { layout } = home([cls('A')], [target('a', 'A'), target('b', 'A', { deadline: '2026-10-20' })], false)
    expect(layout.hero?.primary).toBe(true)
  })

  it('an organizer of one class who also studies in another gets the student step', () => {
    const { step } = home([cls('O', { organizer: true, podSize: null }), cls('A')], [target('x', 'A')], false)
    expect(step.kind).toBe('logToday')
  })
})
