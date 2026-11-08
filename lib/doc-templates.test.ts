import { describe, expect, it } from 'vitest'
import { DOC_TEMPLATES, DOC_TEMPLATE_KEYS, docTemplateSections, parseDocTemplate } from './doc-templates'
import { sourceLabel } from './google-links'

describe('doc templates', () => {
  it('has the same number of sections in both languages, none empty or too long', () => {
    for (const key of DOC_TEMPLATE_KEYS) {
      const { ja, en } = DOC_TEMPLATES[key]
      expect(ja.length).toBe(en.length)
      expect(ja.length).toBeGreaterThanOrEqual(3)
      for (const s of [...ja, ...en]) {
        expect(s.trim()).toBe(s)
        expect(s.length).toBeGreaterThan(0)
        expect(sourceLabel(s)).toBe(s)
      }
    }
  })

  it('parses only known keys', () => {
    expect(parseDocTemplate('report')).toBe('report')
    expect(parseDocTemplate('')).toBeNull()
    expect(parseDocTemplate('constructor')).toBeNull()
    expect(parseDocTemplate(null)).toBeNull()
  })

  it('gives the sections in the locale, Japanese by default, none without a template', () => {
    expect(docTemplateSections('script', 'en')[0]).toBe('Opening')
    expect(docTemplateSections('script', 'ja')[0]).toBe('導入')
    expect(docTemplateSections(null, 'en')).toEqual([])
  })
})
