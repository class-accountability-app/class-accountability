// The word a student types to enable アカウントを削除する. Either language's
// word works in either language (someone may switch the UI mid-way), after
// trimming, width folding (ＤＥＬＥＴＥ) and ignoring case.
const CONFIRM_WORDS = new Set(['削除', 'delete'])

export function isConfirmWord(value: FormDataEntryValue | string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return CONFIRM_WORDS.has(value.normalize('NFKC').trim().toLowerCase())
}
