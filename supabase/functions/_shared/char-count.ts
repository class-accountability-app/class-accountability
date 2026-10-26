// A copy of lib/char-count.ts's countText for the sync-google-progress Edge
// Function, which can't import from lib/ once deployed. Word's 文字数（スペース
// を含めない）: grapheme clusters, whitespace skipped, so a Google Doc and the
// in-app editor give the same number. char-count.test.ts checks the two
// copies agree.

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })
const WHITESPACE = /^\s+$/u

export function countText(text: string): number {
  let n = 0
  for (const { segment } of segmenter.segment(text)) {
    if (!WHITESPACE.test(segment)) n++
  }
  return n
}
