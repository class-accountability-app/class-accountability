import { describe, expect, it } from 'vitest'
import { boardActivity, freshSince, type ActivityInput } from './board-activity'

const now = new Date('2026-11-13T09:00:00Z')
const base: ActivityInput = {
  me: 'me',
  projectCreatedAt: '2026-11-01T00:00:00Z',
  tasks: [],
  checkins: [],
  polls: [],
  links: [],
}

describe('boardActivity', () => {
  it('lists teammates\' events newest first and leaves mine out', () => {
    const events = boardActivity(
      {
        ...base,
        tasks: [
          { id: 't1', title: '台本', owner_id: 'b', created_at: '2026-11-10T01:00:00Z', done_at: '2026-11-12T08:00:00Z' },
          { id: 't2', title: 'スライド', owner_id: 'me', created_at: '2026-11-10T02:00:00Z', done_at: '2026-11-12T09:00:00Z' },
        ],
        checkins: [
          { user_id: 'b', created_at: '2026-11-11T00:00:00Z' },
          { user_id: 'me', created_at: '2026-11-11T01:00:00Z' },
        ],
        polls: [
          { id: 'p1', title: '中間確認', createdBy: 'c', createdAt: '2026-11-12T12:00:00Z', status: 'open' },
          { id: 'p2', title: 'mine', createdBy: 'me', createdAt: '2026-11-12T13:00:00Z', status: 'open' },
          { id: 'p3', title: 'cancelled', createdBy: 'c', createdAt: '2026-11-12T14:00:00Z', status: 'cancelled' },
        ],
        links: [
          { id: 'l1', title: '課題', added_by: 'b', created_at: '2026-11-09T00:00:00Z' },
          { id: 'l2', title: 'mine', added_by: 'me', created_at: '2026-11-09T01:00:00Z' },
        ],
      },
      now
    )
    expect(events.map((e) => e.id)).toEqual([
      'poll:p1',
      'done:t1',
      'checkin:b:2026-11-11T00:00:00Z',
      'added:t2',
      'added:t1',
      'link:l1',
    ])
    expect(events[1]).toEqual({ id: 'done:t1', kind: 'taskDone', at: '2026-11-12T08:00:00Z', actorId: 'b', subject: '台本' })
  })

  it('does not treat the tasks a project started with as news', () => {
    const events = boardActivity(
      {
        ...base,
        projectCreatedAt: '2026-11-10T00:00:00Z',
        tasks: [
          { id: 'start', title: 'from the template', owner_id: null, created_at: '2026-11-10T00:00:30Z', done_at: null },
          { id: 'later', title: 'added by hand', owner_id: null, created_at: '2026-11-10T00:10:00Z', done_at: null },
        ],
      },
      now
    )
    expect(events.map((e) => e.id)).toEqual(['added:later'])
  })

  it('keeps two weeks and nothing from the future', () => {
    const events = boardActivity(
      {
        ...base,
        checkins: [
          { user_id: 'b', created_at: '2026-10-29T00:00:00Z' }, // 15 days ago
          { user_id: 'c', created_at: '2026-10-31T00:00:00Z' }, // 13 days ago
          { user_id: 'd', created_at: '2026-11-14T00:00:00Z' }, // a wrong clock
        ],
      },
      now
    )
    expect(events.map((e) => e.actorId)).toEqual(['c'])
  })
})

describe('freshSince', () => {
  const events = [{ at: '2026-11-13T08:00:00Z' }, { at: '2026-11-12T00:00:00Z' }, { at: '2026-11-09T00:00:00Z' }]
  it('gives what came after the last visit', () => {
    expect(freshSince(events, '2026-11-12T12:00:00Z', now)).toEqual([events[0]])
    expect(freshSince(events, '2026-11-13T08:30:00Z', now)).toEqual([])
  })
  it('falls back to the last three days on a first visit or a broken value', () => {
    expect(freshSince(events, null, now)).toEqual([events[0], events[1]])
    expect(freshSince(events, 'not a date', now)).toEqual([events[0], events[1]])
  })
})
