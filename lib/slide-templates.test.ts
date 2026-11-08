import { describe, expect, it } from 'vitest'
import { SLIDE_TEMPLATES, SLIDE_TEMPLATE_KEYS, parseSlideTemplate, slideTemplateRequests, slideTemplateSections } from './slide-templates'
import { countSlides } from '@/supabase/functions/_shared/google-count'

type CreateSlide = { createSlide: { objectId: string; slideLayoutReference: { predefinedLayout: string } } }

describe('slide templates', () => {
  it('has the same sections count in both languages, none empty', () => {
    for (const key of SLIDE_TEMPLATE_KEYS) {
      const { ja, en } = SLIDE_TEMPLATES[key]
      expect(ja.length).toBe(en.length)
      for (const s of [...ja, ...en]) expect(s.trim()).not.toBe('')
    }
  })

  it('parses only known keys and picks the locale', () => {
    expect(parseSlideTemplate('research')).toBe('research')
    expect(parseSlideTemplate('report')).toBeNull()
    expect(slideTemplateSections('research', 'en')[0]).toBe('Background')
    expect(slideTemplateSections(null, 'ja')).toEqual([])
  })

  it('makes a cover and one slide per section with valid, unique ids, then removes the blank first slide', () => {
    const requests = slideTemplateRequests('最終発表', ['背景', '結果'], 'p')
    const slides = requests.filter((r): r is CreateSlide => 'createSlide' in (r as object))
    expect(slides.map((s) => [s.createSlide.objectId, s.createSlide.slideLayoutReference.predefinedLayout])).toEqual([
      ['sptpl_cover', 'TITLE'],
      ['sptpl_s1', 'TITLE_AND_BODY'],
      ['sptpl_s2', 'TITLE_AND_BODY'],
    ])
    const ids = slides.flatMap((s) => [s.createSlide.objectId, `${s.createSlide.objectId}_t`])
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_]{5,50}$/)
    expect(new Set(ids).size).toBe(ids.length)
    expect(requests.at(-1)).toEqual({ deleteObject: { objectId: 'p' } })
    expect(requests).toContainEqual({ insertText: { objectId: 'sptpl_s2_t', text: '結果' } })
  })

  it('gives a new deck 0 counted slides until something is added', () => {
    const fresh = {
      slides: ['sptpl_cover', 'sptpl_s1'].map((id) => ({
        objectId: id,
        pageElements: [{ objectId: `${id}_t`, shape: { placeholder: { type: 'TITLE' } } }, { objectId: `${id}_b`, shape: { placeholder: { type: 'BODY' } } }],
      })),
    }
    expect(countSlides(fresh)).toBe(0)
  })
})
