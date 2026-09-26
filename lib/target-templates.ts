import type { TargetType } from './targets'

// テンプレートから選ぶ on the new-target page (screen 07). A chip only fills
// in the form; every field stays editable, and nothing records which chip was
// used. The same mapping in both languages (English students can switch the
// type to 語数 / Words themselves).
export const TEMPLATE_IDS = ['report2000', 'report4000', 'study10', 'submit', 'custom'] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

// Keys under targetForm.templateTitles in messages/*.json.
export type TitleKey = 'report' | 'examStudy' | 'submit'

type Fill = { type: TargetType; amount: number | null; titleKey: TitleKey }

export const TEMPLATES: Record<Exclude<TemplateId, 'custom'>, Fill> = {
  report2000: { type: 'character_count', amount: 2000, titleKey: 'report' },
  report4000: { type: 'character_count', amount: 4000, titleKey: 'report' },
  study10: { type: 'study_hours', amount: 10, titleKey: 'examStudy' },
  submit: { type: 'task', amount: null, titleKey: 'submit' },
}

export type TargetDraft = { title: string; type: TargetType; amount: string }

// What the form holds after pressing a chip. 自分で決める keeps the chosen
// type and clears the rest, so the student starts from a blank title.
export function applyTemplate(
  id: TemplateId,
  current: TargetDraft,
  titles: Record<TitleKey, string>
): TargetDraft {
  if (id === 'custom') return { title: '', type: current.type, amount: '' }
  const fill = TEMPLATES[id]
  return {
    title: titles[fill.titleKey],
    type: fill.type,
    amount: fill.amount === null ? '' : String(fill.amount),
  }
}
