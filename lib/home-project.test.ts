import { describe, expect, it } from 'vitest'
import { homeProjectHref } from './home-project'

describe('homeProjectHref', () => {
  it('is null without a project, so Home stays as it is', () => {
    expect(homeProjectHref([])).toBeNull()
  })

  it('opens the only project', () => {
    expect(homeProjectHref([{ classId: 'k', deadline: null, createdAt: '2026-10-01T00:00:00Z' }])).toBe(
      '/classes/k/project'
    )
  })

  it('picks the project due soonest, then one with no deadline, then the oldest', () => {
    const rows = [
      { classId: 'none', deadline: null, createdAt: '2026-09-01T00:00:00Z' },
      { classId: 'late', deadline: '2026-12-01', createdAt: '2026-10-01T00:00:00Z' },
      { classId: 'soon', deadline: '2026-11-20', createdAt: '2026-10-02T00:00:00Z' },
    ]
    expect(homeProjectHref(rows)).toBe('/classes/soon/project')
    expect(homeProjectHref(rows.filter((r) => r.deadline === null))).toBe('/classes/none/project')
    expect(
      homeProjectHref([
        { classId: 'b', deadline: null, createdAt: '2026-10-02T00:00:00Z' },
        { classId: 'a', deadline: null, createdAt: '2026-10-01T00:00:00Z' },
      ])
    ).toBe('/classes/a/project')
  })
})
