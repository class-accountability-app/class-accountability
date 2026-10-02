import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { countDocument, countText, type DocNode } from './char-count'
import { buildDocx, docxFileName } from './docx-export'

const text = (t: string, marks?: string[]) => ({ type: 'text', text: t, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) })
const p = (...content: object[]) => ({ type: 'paragraph', attrs: { indent: 0 }, content })
const item = (...content: object[]) => ({ type: 'listItem', content })

const DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, indent: 0 }, content: [text('はじめに')] },
    p(text('　本研究では、'), text('AI', ['bold']), text(' を 3 つの観点から'), text('検討', ['italic', 'underline']), text('する。')),
    { type: 'heading', attrs: { level: 2, indent: 0 }, content: [text('背景')] },
    { type: 'paragraph', attrs: { indent: 2 }, content: [text('字下げ'), { type: 'hardBreak' }, text('改行のあと')] },
    { type: 'bulletList', content: [item(p(text('点一'))), item(p(text('点二')), { type: 'bulletList', content: [item(p(text('入れ子')))] })] },
    { type: 'orderedList', attrs: { start: 1, type: null }, content: [item(p(text('一番'))), item(p(text('二番')))] },
    { type: 'orderedList', attrs: { start: 3, type: null }, content: [item(p(text('三番')))] },
    { type: 'paragraph', attrs: { indent: 0 } },
    p(text('😀👍🏽 おわり')),
  ],
}

async function unzip(doc = DOC) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocx(doc)))
  const read = (name: string) => zip.file(name)!.async('string')
  return { document: await read('word/document.xml'), styles: await read('word/styles.xml'), numbering: await read('word/numbering.xml') }
}

function paragraphsOf(xml: string): string[] {
  // An empty paragraph is written as <w:p/>.
  return xml.match(/<w:p\/>|<w:p>[\s\S]*?<\/w:p>/g) ?? []
}

function textOf(paragraph: string): string {
  return (paragraph.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]*>/g, ''))
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

describe('buildDocx', () => {
  it('writes one Word paragraph per block, in order, with the text', async () => {
    const { document } = await unzip()
    const paras = paragraphsOf(document)
    expect(paras.map(textOf)).toEqual([
      'はじめに',
      '　本研究では、AI を 3 つの観点から検討する。',
      '背景',
      '字下げ改行のあと',
      '点一',
      '点二',
      '入れ子',
      '一番',
      '二番',
      '三番',
      '',
      '😀👍🏽 おわり',
    ])
  })

  it('the text in the file counts the same as the app (Word’s 文字数, no title)', async () => {
    const { document } = await unzip()
    const inFile = paragraphsOf(document).map(textOf).reduce((n, t) => n + countText(t), 0)
    expect(inFile).toBe(countDocument(DOC as DocNode))
  })

  it('headings use Word’s 見出し 1 and 見出し 2 styles', async () => {
    const { document, styles } = await unzip()
    const paras = paragraphsOf(document)
    expect(paras[0]).toContain('<w:pStyle w:val="Heading1"/>')
    expect(paras[2]).toContain('<w:pStyle w:val="Heading2"/>')
    expect(paras[1]).not.toContain('w:pStyle')
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?<w:name w:val="Heading 1"\/>/)
  })

  it('bold, italic, underline and the line break carry over', async () => {
    const { document } = await unzip()
    const paras = paragraphsOf(document)
    expect(paras[1]).toMatch(/<w:b\/>[\s\S]*?<w:t[^>]*>AI<\/w:t>/)
    expect(paras[1]).toMatch(/<w:i\/>[\s\S]*?<w:u w:val="single"\/>[\s\S]*?<w:t[^>]*>検討<\/w:t>/)
    expect(paras[3]).toContain('<w:br/>')
  })

  it('a paragraph’s indent is 2 字 (420 twips) per level', async () => {
    const { document } = await unzip()
    expect(paragraphsOf(document)[3]).toContain('<w:ind w:left="840"/>')
  })

  it('lists are Word numbering: bullets nest by level, each numbered list restarts', async () => {
    const { document, numbering } = await unzip()
    const paras = paragraphsOf(document)
    const numPr = (p: string) => {
      const m = p.match(/<w:ilvl w:val="(\d+)"\/><w:numId w:val="(\d+)"\/>/)
      return m ? { level: Number(m[1]), id: Number(m[2]) } : null
    }
    const [one, two, nested, first, second, third] = [4, 5, 6, 7, 8, 9].map((i) => numPr(paras[i])!)
    expect(one.level).toBe(0)
    expect(two).toEqual(one)
    expect(nested).toEqual({ level: 1, id: one.id })
    expect(first.level).toBe(0)
    expect(second).toEqual(first)
    expect(third.id).not.toBe(first.id)
    expect(numbering).toContain('w:val="decimal"')
    expect(numbering).toContain('w:val="bullet"')
    expect(numbering).toContain('<w:start w:val="3"/>')
  })

  it('is A4 with 游明朝 10.5pt and Japanese as the language', async () => {
    const { document, styles } = await unzip()
    expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"')
    expect(styles).toContain('w:eastAsia="游明朝"')
    expect(styles).toContain('<w:sz w:val="21"/>')
    expect(styles).toContain('w:eastAsia="ja-JP"')
  })

  it('an empty document is a valid file with no text', async () => {
    const { document } = await unzip({ type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 0 } }] } as typeof DOC)
    expect(paragraphsOf(document).map(textOf)).toEqual([''])
  })
})

describe('docxFileName', () => {
  it.each([
    ['期末レポート', '期末レポート.docx'],
    ['レポート: 第1章/序論?', 'レポート 第1章 序論.docx'],
    ['  ', 'document.docx'],
    ['a'.repeat(200), `${'a'.repeat(80)}.docx`],
  ])('%j → %j', (title, name) => {
    expect(docxFileName(title)).toBe(name)
  })
})
