import { TEMPLATE_SLIDE_PREFIX } from '@/supabase/functions/_shared/google-count'

// Google Slides templates (2026-11-08): a cover and one slide per section, in
// the app's two languages, for a counted task's own deck. Every slide the
// template adds has an object id starting with TEMPLATE_SLIDE_PREFIX, and such
// a slide is counted only once something besides its title is on it
// (_shared/google-count.ts), so a new deck starts at 0 slides.

export const SLIDE_TEMPLATE_KEYS = ['presentation', 'research', 'proposal', 'caseStudy'] as const
export type SlideTemplateKey = (typeof SLIDE_TEMPLATE_KEYS)[number]

export const SLIDE_TEMPLATES: Record<SlideTemplateKey, Record<'ja' | 'en', readonly string[]>> = {
  presentation: {
    ja: ['目次', '背景', '目的', '内容1', '内容2', 'まとめ', '参考文献'],
    en: ['Contents', 'Background', 'Aims', 'Point 1', 'Point 2', 'Summary', 'References'],
  },
  research: {
    ja: ['背景', '目的', '方法', '結果', '考察', 'まとめ', '参考文献'],
    en: ['Background', 'Aims', 'Method', 'Results', 'Discussion', 'Summary', 'References'],
  },
  proposal: {
    ja: ['課題', '提案', 'しくみ', 'スケジュール', '期待される成果', 'まとめ'],
    en: ['The problem', 'Our proposal', 'How it works', 'Schedule', 'Expected results', 'Summary'],
  },
  caseStudy: {
    ja: ['事例の概要', '問題点', '分析', '提案', 'まとめ'],
    en: ['The case', 'The problem', 'Analysis', 'Recommendations', 'Summary'],
  },
}

export function parseSlideTemplate(value: unknown): SlideTemplateKey | null {
  return typeof value === 'string' && (SLIDE_TEMPLATE_KEYS as readonly string[]).includes(value)
    ? (value as SlideTemplateKey)
    : null
}

export function slideTemplateSections(key: SlideTemplateKey | null, locale: string): readonly string[] {
  if (!key) return []
  return SLIDE_TEMPLATES[key][locale === 'en' ? 'en' : 'ja']
}

// Slides API batchUpdate requests for a new presentation: a cover with the
// task's title, one "title and body" slide per section with its heading, then
// the blank slide Google starts every presentation with is removed. Object
// ids are 5–50 characters of [A-Za-z0-9_], unique in the deck.
export function slideTemplateRequests(title: string, sections: readonly string[], firstSlideId: string | null): unknown[] {
  const requests: unknown[] = []
  const slide = (id: string, layout: 'TITLE' | 'TITLE_AND_BODY', titleType: 'CENTERED_TITLE' | 'TITLE', text: string) => {
    requests.push({
      createSlide: {
        objectId: id,
        slideLayoutReference: { predefinedLayout: layout },
        placeholderIdMappings: [{ layoutPlaceholder: { type: titleType, index: 0 }, objectId: `${id}_t` }],
      },
    })
    if (text) requests.push({ insertText: { objectId: `${id}_t`, text } })
  }
  slide(`${TEMPLATE_SLIDE_PREFIX}cover`, 'TITLE', 'CENTERED_TITLE', title)
  sections.forEach((s, i) => slide(`${TEMPLATE_SLIDE_PREFIX}s${i + 1}`, 'TITLE_AND_BODY', 'TITLE', s))
  if (firstSlideId) requests.push({ deleteObject: { objectId: firstSlideId } })
  return requests
}
