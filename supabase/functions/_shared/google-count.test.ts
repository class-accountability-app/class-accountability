import { describe, expect, it } from 'vitest'
import { DOC_FIELDS, SLIDES_FIELDS, countDoc, countDocWords, countSheetRows, countSlides, countWords, docHeadings, type DocsDocument, type DocsElement } from './google-count'

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
  it('counts the whole document without whitespace or headings, tables included', () => {
    // 統計は面白い。(7) ABC(3) 表の中(3) 😀👍🏽(2) 12345(5); the title and headings count 0
    expect(countDoc(doc, null)).toBe(7 + 3 + 3 + 2 + 5)
  })

  it('counts a section up to the next heading of the same level, sub-sections included, headings left out', () => {
    expect(countDoc(doc, 'h.intro')).toBe(7 + 3 + 3 + 2)
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

  it('counts a template slide only once something besides its title is on it', () => {
    const title = { objectId: 'x_t', shape: { placeholder: { type: 'TITLE' }, text: { textElements: [{ textRun: { content: '背景\n' } }] } } }
    const emptyBody = { objectId: 'x_b', shape: { placeholder: { type: 'BODY' }, text: { textElements: [{ textRun: { content: ' \n' } }] } } }
    const filledBody = { objectId: 'x_b', shape: { placeholder: { type: 'BODY' }, text: { textElements: [{ textRun: { content: '調べたこと\n' } }] } } }
    expect(
      countSlides({
        slides: [
          { objectId: 'sptpl_cover', pageElements: [{ objectId: 'c', shape: { placeholder: { type: 'CENTERED_TITLE' } } }] },
          { objectId: 'sptpl_s1', pageElements: [title, emptyBody] },
          { objectId: 'sptpl_s2', pageElements: [title, filledBody] },
          { objectId: 'sptpl_s3', pageElements: [title, { objectId: 'img' }] }, // an image
          { objectId: 'g123', pageElements: [] }, // a slide the student added: always counts
        ],
      })
    ).toBe(3)
  })
})

describe('DOC_FIELDS / SLIDES_FIELDS', () => {
  it.each([DOC_FIELDS, SLIDES_FIELDS])('has balanced parentheses (Google rejects the request otherwise)', (fields) => {
    let depth = 0
    for (const c of fields) {
      if (c === '(') depth++
      if (c === ')') depth--
      expect(depth).toBeGreaterThanOrEqual(0)
    }
    expect(depth).toBe(0)
  })
})

describe('countWords / countDocWords (0040)', () => {
  it('counts whitespace-separated pieces with a letter or digit, like Word', () => {
    expect(countWords('The quick brown fox')).toBe(4)
    expect(countWords('  well-known   results, 2026 — done. \n')).toBe(4)
    expect(countWords("don't stop")).toBe(2)
    expect(countWords(' — ... ')).toBe(0)
    expect(countWords('')).toBe(0)
  })
  it('counts the whole document without headings, tables included', () => {
    const d: DocsDocument = {
      body: {
        content: [
          para('Title here\n', 'TITLE'),
          para('Intro\n', 'HEADING_1', 'h.i'),
          para('One two three.\n'),
          { table: { tableRows: [{ tableCells: [{ content: [para('cell words\n')] }] }] } },
        ],
      },
    }
    // One two three. (3) cell words (2); the title and heading are left out
    expect(countDocWords(d)).toBe(5)
  })
})

describe('countSheetRows (0040)', () => {
  it('counts filled rows below the header', () => {
    expect(countSheetRows({ values: [['Timestamp', 'Q1'], ['2026/11/02', 'yes'], [], ['2026/11/03', ''], ['', '  ']] })).toBe(2)
  })
  it('is 0 for an empty sheet or a header only', () => {
    expect(countSheetRows({})).toBe(0)
    expect(countSheetRows({ values: [['Timestamp']] })).toBe(0)
  })
})
