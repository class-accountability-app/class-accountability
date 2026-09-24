import type { ErrorKey } from '@/lib/errors'

// Display-name rules, shared by the welcome screen, settings and the server
// action. The database (0011) enforces what Postgres can express exactly
// (trimmed, no control characters, at most 80 code points); the "1 to 20
// characters" rule lives here because only Intl.Segmenter counts characters
// the way a person does: "👍🏽" or "が" typed as か + ゛ is one character.

export const DISPLAY_NAME_MAX = 20

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Control characters (newline, tab, NUL...), matching the database's [[:cntrl:]].
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/

export function graphemeCount(text: string): number {
  return Array.from(segmenter.segment(text)).length
}

export type DisplayNameResult = { value: string; error: null } | { value: null; error: ErrorKey }

// NFC first, so a name typed with combining marks is stored the same way as
// one typed precomposed. trim() also removes the full-width space U+3000.
export function normalizeDisplayName(raw: unknown): DisplayNameResult {
  const value = typeof raw === 'string' ? raw.normalize('NFC').trim() : ''
  if (value === '') return { value: null, error: 'displayNameRequired' }
  if (CONTROL_CHARS.test(value)) return { value: null, error: 'displayNameInvalid' }
  if (graphemeCount(value) > DISPLAY_NAME_MAX) return { value: null, error: 'displayNameTooLong' }
  return { value, error: null }
}
