// Google Doc templates (2026-11-08): section headings to start writing from,
// in the app's two languages. Used two ways: under each task's heading in the
// group Doc, and as the outline of a new Doc made for one task. Headings are
// never counted (_shared/google-count.ts), so a template adds 0 characters:
// only what the students write under it counts.

export const DOC_TEMPLATE_KEYS = ['report', 'script', 'proposal', 'literatureReview', 'caseStudy'] as const
export type DocTemplateKey = (typeof DOC_TEMPLATE_KEYS)[number]

export const DOC_TEMPLATES: Record<DocTemplateKey, Record<'ja' | 'en', readonly string[]>> = {
  report: {
    ja: ['はじめに', '背景と目的', '方法', '結果', '考察', 'おわりに'],
    en: ['Introduction', 'Background and aims', 'Method', 'Results', 'Discussion', 'Conclusion'],
  },
  script: {
    ja: ['導入', '本論1', '本論2', 'まとめ', '質疑応答のメモ'],
    en: ['Opening', 'Main point 1', 'Main point 2', 'Wrap-up', 'Notes for Q&A'],
  },
  proposal: {
    ja: ['背景', '目的', '内容', 'スケジュール', '期待される成果'],
    en: ['Background', 'Aims', 'What we will do', 'Schedule', 'Expected results'],
  },
  literatureReview: {
    ja: ['テーマと問い', '先行研究の整理', '論点', 'まとめ', '参考文献'],
    en: ['Topic and question', 'What earlier studies found', 'Open questions', 'Summary', 'References'],
  },
  caseStudy: {
    ja: ['事例の概要', '問題点', '分析', '提案', 'まとめ'],
    en: ['The case', 'The problem', 'Analysis', 'Recommendations', 'Summary'],
  },
}

// A form's value: a known key, or null for "no template" (anything else).
export function parseDocTemplate(value: unknown): DocTemplateKey | null {
  return typeof value === 'string' && (DOC_TEMPLATE_KEYS as readonly string[]).includes(value)
    ? (value as DocTemplateKey)
    : null
}

export function docTemplateSections(key: DocTemplateKey | null, locale: string): readonly string[] {
  if (!key) return []
  return DOC_TEMPLATES[key][locale === 'en' ? 'en' : 'ja']
}
