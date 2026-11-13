import { describe, expect, it } from 'vitest'
import { parseCurrentProjects, pickCurrentProject, sortProjects, withCurrentProject } from './current-project'

const c1 = '11111111-1111-4111-8111-111111111111'
const c2 = '22222222-2222-4222-8222-222222222222'
const p1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const p2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('current project cookie', () => {
  it('round-trips one choice per class', () => {
    const value = withCurrentProject(withCurrentProject('', c1, p1), c2, p2)
    expect(value).toBe(`${c1}:${p1},${c2}:${p2}`)
    expect(parseCurrentProjects(value).get(c1)).toBe(p1)
    expect(withCurrentProject(value, c1, p2)).toBe(`${c2}:${p2},${c1}:${p2}`)
  })

  it('drops anything that is not a pair of ids', () => {
    expect([...parseCurrentProjects(`junk,${c1}:nope,<script>:${p1},${c2}:${p2}`).entries()]).toEqual([[c2, p2]])
    expect(parseCurrentProjects(undefined).size).toBe(0)
    expect(withCurrentProject('', 'x', 'y')).toBe('')
  })

  it('keeps at most 12 classes, newest choices last', () => {
    let value = ''
    for (let i = 0; i < 15; i++) {
      const cls = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
      value = withCurrentProject(value, cls, p1)
    }
    const map = parseCurrentProjects(value)
    expect(map.size).toBe(12)
    expect(map.has('00000000-0000-4000-8000-000000000000')).toBe(false)
    expect(map.has('00000014-0000-4000-8000-000000000000')).toBe(true)
  })
})

describe('sortProjects / pickCurrentProject', () => {
  const projects = [
    { id: 'none', deadline: null, created_at: '2026-11-01T00:00:00Z' },
    { id: 'late', deadline: '2026-12-18', created_at: '2026-11-01T00:00:00Z' },
    { id: 'soon', deadline: '2026-11-30', created_at: '2026-11-05T00:00:00Z' },
  ]
  it('orders by deadline, none last', () => {
    expect(sortProjects(projects).map((p) => p.id)).toEqual(['soon', 'late', 'none'])
  })
  it('shows the chosen project while it is still active, else the soonest', () => {
    expect(pickCurrentProject(projects, 'late')?.id).toBe('late')
    expect(pickCurrentProject(projects, 'finished-or-unknown')?.id).toBe('soon')
    expect(pickCurrentProject(projects, null)?.id).toBe('soon')
    expect(pickCurrentProject([], 'late')).toBeNull()
  })
})
