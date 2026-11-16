import { describe, expect, it } from 'vitest'
import { LEAVE_GRACE_MS, applyLive, liveMembers, shownMembers, teamTopic, trackLeaves } from './live-presence'

describe('teamTopic', () => {
  it('is the shape the database allows (0051)', () => {
    expect(teamTopic('00000000-0000-4000-8000-0000000051f1')).toBe('team:00000000-0000-4000-8000-0000000051f1')
  })
})

describe('liveMembers', () => {
  it('counts each key with an entry once (two tabs are one person)', () => {
    expect(liveMembers({ a: [{}], b: [{}, {}], c: [] })).toEqual(new Set(['a', 'b']))
    expect(liveMembers({})).toEqual(new Set())
  })
})

describe('trackLeaves', () => {
  it('notes when someone drops out, and forgets it when they are back', () => {
    const left = trackLeaves(new Set(['a', 'b']), new Set(['a']), new Map(), 1000)
    expect(left).toEqual(new Map([['b', 1000]]))
    expect(trackLeaves(new Set(['a']), new Set(['a', 'b']), left, 2000)).toEqual(new Map())
  })

  it('keeps the first leave time while they stay away', () => {
    const left = new Map([['b', 1000]])
    expect(trackLeaves(new Set(['a']), new Set(['a']), left, 5000)).toEqual(new Map([['b', 1000]]))
  })
})

describe('shownMembers', () => {
  it('keeps someone who just left for the grace period, then drops them', () => {
    const left = new Map([['b', 1000]])
    expect(shownMembers(new Set(['a']), left, 1000 + LEAVE_GRACE_MS - 1)).toEqual(new Set(['a', 'b']))
    expect(shownMembers(new Set(['a']), left, 1000 + LEAVE_GRACE_MS)).toEqual(new Set(['a']))
  })
})

describe('applyLive', () => {
  const rows = [
    { user_id: 'a', last_seen_day: '2026-11-16', online: true },
    { user_id: 'b', last_seen_day: '2026-11-16', online: false },
    { user_id: 'c', last_seen_day: null, online: false },
  ]

  it('leaves the polled answer alone while the channel is not connected', () => {
    expect(applyLive(rows, null)).toEqual(rows)
  })

  it('takes online from the channel while it is connected, both ways', () => {
    // a closed the app (still inside the 100-second window by polling), b opened it.
    expect(applyLive(rows, new Set(['b'])).map((r) => r.online)).toEqual([false, true, false])
  })

  it('keeps the last day seen and does not change the rows it was given', () => {
    const out = applyLive(rows, new Set())
    expect(out.map((r) => r.last_seen_day)).toEqual(['2026-11-16', '2026-11-16', null])
    expect(rows[0].online).toBe(true)
  })
})
