import { describe, expect, it } from 'vitest'
import { DOC_FIELDS, countDoc, countSlides, docHeadings, type DocsDocument, type DocsElement } from './google-count'

const para = (text: string, style?: string, headingId?: string): DocsElement => ({
  paragraph: {
    elements: [{ textRun: { content: text } }],
    paragraphStyle: style ? { namedStyleType: style, headingId } : undefined,
  },
})

// A group Doc as the app creates it: a title, one heading per task.
const doc: DocsDocument = {
  body: {
    content: [
      para('グループ発表\n', 'TITLE'),
      para('はじめに — あき\n', 'HEADING_1', 'h.intro'),
      para('統計は 面白い。\n'),
      para('小見出し\n', 'HEADING_2', 'h.sub'),
      para('ABC\n'),
      {
        table: {
          tableRows: [{ tableCells: [{ content: [para('表の中\n')] }, { content: [para('😀👍🏽\n')] }] }],
        },
      },
      para('データと分析 — 佐藤さん\n', 'HEADING_1', 'h.data'),
      para('12345\n'),
    ],
  },
}

describe('countDoc', () => {
  it('counts the whole document without whitespace, tables included', () => {
    // グループ発表(6) はじめに—あき(7) 統計は面白い。(7) 小見出し(4) ABC(3) 表の中(3) 😀👍🏽(2) データと分析—佐藤さん(11) 12345(5)
    expect(countDoc(doc, null)).toBe(6 + 7 + 7 + 4 + 3 + 3 + 2 + 11 + 5)
  })

  it('counts a section up to the next heading of the same level, sub-headings included', () => {
    expect(countDoc(doc, 'h.intro')).toBe(7 + 4 + 3 + 3 + 2)
    expect(countDoc(doc, 'h.sub')).toBe(3 + 3 + 2)
    expect(countDoc(doc, 'h.data')).toBe(5)
  })

  it('is null when the heading was deleted', () => {
    expect(countDoc(doc, 'h.gone')).toBeNull()
  })

  it('counts an empty document as 0', () => {
    expect(countDoc({}, null)).toBe(0)
  })
})

describe('docHeadings', () => {
  it('lists linkable headings in order, without the title', () => {
    expect(docHeadings(doc)).toEqual([
      { headingId: 'h.intro', level: 1, text: 'はじめに — あき' },
      { headingId: 'h.sub', level: 2, text: '小見出し' },
      { headingId: 'h.data', level: 1, text: 'データと分析 — 佐藤さん' },
    ])
  })
})

describe('countSlides', () => {
  it('counts slides', () => {
    expect(countSlides({ slides: [{}, {}, {}] })).toBe(3)
    expect(countSlides({})).toBe(0)
  })
})

describe('DOC_FIELDS', () => {
  it('has balanced parentheses (Google rejects the request otherwise)', () => {
    let depth = 0
    for (const c of DOC_FIELDS) {
      if (c === '(') depth++
      if (c === ')') depth--
      expect(depth).toBeGreaterThanOrEqual(0)
    }
    expect(depth).toBe(0)
  })
})
