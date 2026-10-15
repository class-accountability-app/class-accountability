import type { TargetType } from './targets'

// The four starting points on the simplified new-target form (Prompt 15): a
// preset only fills in the type, how it is logged, the amount and a title. Every
// field stays editable and nothing records which preset was used. (The older
// five templates in target-templates.ts stay for /targets/new until the form
// is swapped.)
export const PRESET_IDS = ['report', 'write', 'study', 'submit'] as const
export type PresetId = (typeof PRESET_IDS)[number]

export type InputMode = 'manual' | 'document'

// Keys under targetForm.templateTitles in messages/*.json.
export type TitleKey = 'report' | 'examStudy' | 'submit'

type Preset = { type: TargetType; mode: InputMode; amount: number | null; titleKey: TitleKey }

export const PRESETS: Record<PresetId, Preset> = {
  report: { type: 'character_count', mode: 'manual', amount: 2000, titleKey: 'report' },
  write: { type: 'character_count', mode: 'document', amount: 2000, titleKey: 'report' },
  study: { type: 'study_hours', mode: 'manual', amount: 10, titleKey: 'examStudy' },
  submit: { type: 'task', mode: 'manual', amount: null, titleKey: 'submit' },
}

export type PresetDraft = { title: string; type: TargetType; mode: InputMode; amount: string }

// The preset a draft's type and mode match, or null (words, or a mix).
export function presetFor(type: TargetType, mode: InputMode): PresetId | null {
  return PRESET_IDS.find((id) => PRESETS[id].type === type && PRESETS[id].mode === mode) ?? null
}

// What the form holds after tapping a preset. A title the student typed is
// kept; an empty one, or one of the preset titles, is replaced. The amount
// is replaced when the unit changes (2000 characters isn't 2000 hours) and
// kept when only the mode changes.
export function applyPreset(
  id: PresetId,
  current: PresetDraft,
  titles: Record<TitleKey, string>
): PresetDraft {
  const preset = PRESETS[id]
  const isDefaultTitle = current.title.trim() === '' || Object.values(titles).includes(current.title)
  const sameUnit = current.type === preset.type
  return {
    title: isDefaultTitle ? titles[preset.titleKey] : current.title,
    type: preset.type,
    mode: preset.mode,
    amount: preset.amount === null ? '' : sameUnit && current.amount !== '' ? current.amount : String(preset.amount),
  }
}

// Changing the type under その他の設定: a written document is only for a
// character count, so any other type goes back to logging it yourself.
export function withType(current: PresetDraft, type: TargetType): PresetDraft {
  return {
    ...current,
    type,
    mode: type === 'character_count' ? current.mode : 'manual',
    amount: type === 'task' || type !== current.type ? '' : current.amount,
  }
}
