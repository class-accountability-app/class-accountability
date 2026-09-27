import type { TargetType } from './targets'

// Quick log (screen 10): what the amount field accepts, the chips that add to
// it, and the numbers behind the preview line. The server action parses the
// amount with the same function, so the sheet and the database agree.

export type AmountType = Exclude<TargetType, 'task'>

// Quick chips add to whatever is in the field.
export const CHIPS: Record<AmountType, readonly number[]> = {
  character_count: [100, 300, 500],
  word_count: [50, 100, 200],
  study_hours: [0.5, 1, 2],
}

// Hours can have up to two decimals (1.25 時間); everything else is whole.
const HOURS_DECIMALS = 2

export function isHours(type: AmountType): boolean {
  return type === 'study_hours'
}

// What a student typed, as a positive number, or null if it isn't one.
// NFKC turns full-width digits and points from a Japanese keyboard ("５４０",
// "１．５") into plain ones; thousands separators are dropped ("1,240").
export function parseAmount(raw: string, type: AmountType): number | null {
  const text = raw.normalize('NFKC').trim().replace(/[,\s]/g, '')
  const pattern = isHours(type) ? /^\d+(\.\d{1,2})?$|^\.\d{1,2}$/ : /^\d+$/
  if (!pattern.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

// The field's text after pressing a chip. An empty or unreadable field
// counts as 0, so a chip always gives a usable number.
export function addChip(raw: string, chip: number, type: AmountType): string {
  const current = parseAmount(raw, type) ?? 0
  return formatAmountInput(current + chip, type)
}

export function formatAmountInput(value: number, type: AmountType): string {
  if (!isHours(type)) return String(Math.round(value))
  const factor = 10 ** HOURS_DECIMALS
  return String(Math.round(value * factor) / factor)
}

// Rounds away floating-point noise when totals are summed (0.1 + 0.2).
export function tidyTotal(value: number): number {
  return Math.round(value * 100) / 100
}

// Whole percent, rounded down so 99.6% never reads as 100%.
export function percentOf(total: number, target: number): number {
  if (target <= 0) return 0
  return Math.floor((total / target) * 100)
}
