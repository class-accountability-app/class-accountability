import { describe, expect, it } from 'vitest'
import { groupRoster, isAutoSplitSize, splitPreview, type RosterRow } from './organizer'

const row = (id: string, pod: string | null, no: number | null, name: string | null = null): RosterRow => ({
  user_id: id,
  display_name: id,
  pod_id: pod,
  team_no: no,
  team_name: name,
})

describe('organizer tools', () => {
  it('groups the roster: no team first, then teams in order', () => {
    const { unassigned, teams } = groupRoster([row('a', null, null), row('b', 'p2', 2), row('c', 'p1', 1, 'Sakura'), row('d', 'p2', 2)])
    expect(unassigned.map((r) => r.user_id)).toEqual(['a'])
    expect(teams.map((t) => [t.teamNo, t.name, t.members.length])).toEqual([
      [1, 'Sakura', 1],
      [2, null, 2],
    ])
  })

  it('previews auto-split like the database (sizes differ by at most one)', () => {
    expect(splitPreview(5, 2)).toEqual([2, 2, 1])
    expect(splitPreview(10, 4)).toEqual([4, 3, 3])
    expect(splitPreview(12, 4)).toEqual([4, 4, 4])
    expect(splitPreview(0, 3)).toEqual([])
  })

  it('takes team sizes 2 to 6 only', () => {
    expect(isAutoSplitSize(2)).toBe(true)
    expect(isAutoSplitSize(6)).toBe(true)
    expect(isAutoSplitSize(7)).toBe(false)
    expect(isAutoSplitSize('3')).toBe(false)
  })
})
