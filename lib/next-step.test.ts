import { describe, expect, it } from 'vitest'
import { nextStep, type NextStepClass } from './next-step'

const cls = (id: string, over: Partial<NextStepClass> = {}): NextStepClass => ({
  id,
  name: `Class ${id}`,
  organizer: false,
  podSize: 3,
  invited: false,
  project: 'started',
  ...over,
})
const run = (classes: NextStepClass[]) => nextStep({ classes })

describe('nextStep', () => {
  it('in no class → join; an organizer only → share the link', () => {
    expect(run([])).toEqual({ kind: 'join' })
    expect(run([cls('O', { organizer: true, podSize: null })])).toEqual({ kind: 'share', classId: 'O', className: 'Class O' })
  })

  it('an invitation comes first, while I have no team there', () => {
    expect(run([cls('A', { podSize: null, invited: true, project: 'none' })])).toMatchObject({ kind: 'invitation', classId: 'A' })
    expect(run([cls('A', { invited: true })])).toMatchObject({ kind: 'openProject' })
  })

  it('a team without a project → start it, before another class without a team', () => {
    expect(run([cls('A', { podSize: null, project: 'none' }), cls('B', { project: 'none' })])).toEqual({
      kind: 'startProject',
      classId: 'B',
      className: 'Class B',
    })
  })

  it('no team → start or join one', () => {
    expect(run([cls('A', { podSize: null, project: 'none' })])).toMatchObject({ kind: 'pod', classId: 'A' })
  })

  it('alone in a team → invite; otherwise → open the project', () => {
    expect(run([cls('A', { podSize: 1 })])).toMatchObject({ kind: 'invite', classId: 'A' })
    expect(run([cls('A'), cls('B')])).toEqual({ kind: 'openProject', classId: 'A', className: 'Class A' })
  })

  it('ignores classes I organize', () => {
    expect(run([cls('O', { organizer: true, podSize: null }), cls('A', { podSize: null, project: 'none' })])).toMatchObject({
      kind: 'pod',
      classId: 'A',
    })
  })
})
