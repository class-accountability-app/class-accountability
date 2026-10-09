import { describe, expect, it } from 'vitest'
import { countDocument, countText } from './char-count'

describe('countText (Word: 文字数（スペースを含めない）)', () => {
  // The 10 examples from the plan, plus the extra cases.
  it.each([
    ['', 0],
    ['こんにちは', 5],
    ['こんにちは 世界', 7], // half-width space
    ['こんにちは　世界', 7], // full-width space
    ['一行目\n二行目', 6], // line break
    ['\t字下げ', 3], // tab
    ['Hello, world!', 12],
    ['「レポート」です。', 9],
    ['😀👍🏽 👨‍👩‍👧', 3], // skin tone and a family ZWJ sequence count once each
    ['　本研究では、AI を 3 つの観点から検討する。\n（1）背景', 26],
    ['１２３ＡＢＣ', 6], // full-width digits and letters
    ['が', 1], // か + combining dakuten
    ['\r\n 　\t', 0], // whitespace only
    ['a b', 2], // no-break space
  ])('%j → %i', (text, expected) => {
    expect(countText(text)).toBe(expected)
  })
})

describe('countDocument', () => {
  it('sums text across paragraphs, headings and lists; boundaries add nothing', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'はじめに' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '本研究は' },
            { type: 'text', text: '重要', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'である。' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '一つ目' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph' }] },
          ],
        },
        { type: 'paragraph' },
      ],
    }
    expect(countDocument(doc)).toBe(4 + 4 + 2 + 4 + 3)
  })

  it('an empty document is 0', () => {
    expect(countDocument({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(0)
  })
})
