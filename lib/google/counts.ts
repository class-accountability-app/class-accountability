// Unicode-aware character counting for the Google Docs POC.
//
// .length counts UTF-16 code units, which miscounts astral-plane characters
// (many emoji, some CJK extension characters) and doesn't account for
// grapheme clusters (combining marks, ZWJ sequences). Intl.Segmenter with
// granularity 'grapheme' counts user-perceived characters instead.

export type DocCounts = {
  charsWithSpaces: number
  charsNoSpaces: number
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function graphemeCount(text: string): number {
  if (segmenter) {
    return [...segmenter.segment(text)].length
  }
  // Fallback if Intl.Segmenter is unavailable: code-point aware (handles
  // surrogate pairs correctly) but not grapheme-cluster aware.
  return Array.from(text).length
}

export function countDoc(text: string): DocCounts {
  return {
    charsWithSpaces: graphemeCount(text),
    charsNoSpaces: graphemeCount(text.replace(/\s/gu, '')),
  }
}
