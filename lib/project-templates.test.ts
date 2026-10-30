import { describe, expect, it } from 'vitest'
import { PROJECT_TEMPLATES, PROJECT_TEMPLATE_KEYS, isProjectTemplateKey, templateTasks } from './project-templates'

describe('project templates', () => {
  it('has the same tasks in both languages', () => {
    for (const key of PROJECT_TEMPLATE_KEYS) {
      const { ja, en } = PROJECT_TEMPLATES[key]
      expect(ja.length).toBe(en.length)
      ja.forEach((row, i) => {
        expect(en[i].metric).toBe(row.metric)
        expect(en[i].target).toBe(row.target)
        expect(en[i].daysBefore).toBe(row.daysBefore)
      })
    }
  })

  it('knows its own keys only', () => {
    expect(isProjectTemplateKey('poster')).toBe(true)
    expect(isProjectTemplateKey('constructor')).toBe(false)
    expect(isProjectTemplateKey(undefined)).toBe(false)
  })
})

describe('templateTasks', () => {
  it('turns every template into valid rows, in order', () => {
    for (const key of PROJECT_TEMPLATE_KEYS) {
      const rows = templateTasks(key, 'ja', null, '2026-10-30')
      expect(rows).toHaveLength(PROJECT_TEMPLATES[key].ja.length)
      expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i + 1))
    }
  })

  it('counts due dates back from the deadline, never before today', () => {
    const rows = templateTasks('report', 'en', '2026-12-18', '2026-11-20')
    expect(rows.map((r) => r.due)).toEqual(['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-13', '2026-12-17'])
  })

  it('leaves due dates out without a deadline or with one already past', () => {
    expect(templateTasks('report', 'ja', null, '2026-10-30').every((r) => r.due === null)).toBe(true)
    expect(templateTasks('report', 'ja', '2026-10-01', '2026-10-30').every((r) => r.due === null)).toBe(true)
  })

  it('keeps units for counts and drops them elsewhere', () => {
    const [plan, script, frames] = templateTasks('video', 'en', null, '2026-10-30')
    expect(plan).toMatchObject({ metric: 'status', unit: null, target_amount: null })
    expect(script).toMatchObject({ metric: 'characters', unit: null, target_amount: 2000 })
    expect(frames).toMatchObject({ metric: 'count', unit: 'frames', target_amount: 12 })
  })
})
