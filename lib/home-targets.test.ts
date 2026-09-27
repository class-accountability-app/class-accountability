import { describe, expect, it } from 'vitest'
import { sortHomeTargets } from './home-targets'

const t = (id: string, deadline: string | null, finished = false, createdAt = '2026-09-01') => ({
  id,
  deadline,
  finished,
  createdAt,
})

describe('sortHomeTargets', () => {
  it('puts the nearest deadline first and no deadline last', () => {
    const sorted = sortHomeTargets([t('none', null), t('late', '2026-12-01'), t('soon', '2026-10-01')])
    expect(sorted.map((x) => x.id)).toEqual(['soon', 'late', 'none'])
  })

  it('puts finished targets after unfinished ones, whatever their deadline', () => {
    const sorted = sortHomeTargets([t('done-soon', '2026-10-01', true), t('open-none', null)])
    expect(sorted.map((x) => x.id)).toEqual(['open-none', 'done-soon'])
  })

  it('keeps creation order for ties', () => {
    const sorted = sortHomeTargets([
      t('second', null, false, '2026-09-02'),
      t('first', null, false, '2026-09-01'),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['first', 'second'])
  })
})
