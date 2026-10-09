import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Paragraph,
  TextRun,
  type ILevelsOptions,
  type INumberingOptions,
  type ParagraphChild,
} from 'docx'
import type { JSONContent } from '@tiptap/core'

// 「Word で書き出す」 (Prompt 12): the document as a .docx, built in the
// browser from the editor's JSON. No title is added (the author's decision),
// so Word's 文字数（スペースを含めない） equals the app's count. A4, 游明朝
// 10.5pt, headings as Word's own 見出し 1/2, lists as Word numbering, and
// 2 字 of indent per level.
//
// Fonts: Word picks a substitute (usually ＭＳ 明朝) when 游明朝 isn't
// installed. The docx package can't write a fallback (w:altName) into the
// font table, so that is left to Word.

const FONT = '游明朝'
const BODY_HALF_POINTS = 21 // 10.5pt, Word's Japanese default
// One 字 at 10.5pt, in twentieths of a point.
const JI = 210
export const INDENT_PER_LEVEL = 2 * JI

// A4 in twips, with Word's Japanese default margins.
const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1985, bottom: 1701, left: 1701, right: 1701 },
}

const BULLETS = ['●', '○', '■']
const MAX_LIST_LEVEL = 8 // Word's levels are 0–8

type Marks = { bold?: boolean; italics?: boolean; underline?: object }

function runsFor(nodes: JSONContent[] | undefined): ParagraphChild[] {
  const runs: ParagraphChild[] = []
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
      continue
    }
    if (node.type !== 'text' || !node.text) continue
    const marks: Marks = {}
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') marks.bold = true
      if (mark.type === 'italic') marks.italics = true
      if (mark.type === 'underline') marks.underline = {}
    }
    runs.push(new TextRun({ text: node.text, ...marks }))
  }
  return runs
}

function indentOf(node: JSONContent): number {
  const n = Number(node.attrs?.indent ?? 0)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function listLevels(ordered: boolean, start: number): ILevelsOptions[] {
  return Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : BULLETS[level % BULLETS.length],
    start: ordered && level === 0 ? start : 1,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: { indent: { left: INDENT_PER_LEVEL * (level + 1), hanging: INDENT_PER_LEVEL } },
    },
  }))
}

export function buildDocx(content: JSONContent): Document {
  const paragraphs: Paragraph[] = []
  const numbering: INumberingOptions['config'][number][] = [
    { reference: 'bullets', levels: listLevels(false, 1) },
  ]

  function block(node: JSONContent, list?: { reference: string; level: number }) {
    switch (node.type) {
      case 'paragraph':
      case 'heading': {
        const heading =
          node.type === 'heading' ? (node.attrs?.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1) : undefined
        const indent = indentOf(node)
        paragraphs.push(
          new Paragraph({
            children: runsFor(node.content),
            ...(heading ? { heading } : {}),
            ...(list ? { numbering: list } : {}),
            ...(!list && indent > 0 ? { indent: { left: indent * INDENT_PER_LEVEL } } : {}),
          })
        )
        return
      }
      case 'bulletList':
      case 'orderedList': {
        const level = list ? Math.min(list.level + 1, MAX_LIST_LEVEL) : 0
        let reference = 'bullets'
        if (node.type === 'orderedList') {
          // Each numbered list counts from its own start.
          reference = `numbers-${numbering.length}`
          const start = Number(node.attrs?.start ?? 1)
          numbering.push({ reference, levels: listLevels(true, Number.isInteger(start) && start > 0 ? start : 1) })
        }
        for (const item of node.content ?? []) {
          // The item's first paragraph carries the bullet; any more are
          // continuation paragraphs at the same indent, as in Word.
          ;(item.content ?? []).forEach((child, i) => {
            if (i === 0 && (child.type === 'paragraph' || child.type === 'heading')) {
              block(child, { reference, level })
            } else if (child.type === 'paragraph' || child.type === 'heading') {
              paragraphs.push(
                new Paragraph({ children: runsFor(child.content), indent: { left: INDENT_PER_LEVEL * (level + 1) } })
              )
            } else {
              block(child, { reference, level })
            }
          })
        }
        return
      }
    }
  }

  for (const node of content.content ?? []) block(node)

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT }, size: BODY_HALF_POINTS, language: { value: 'ja-JP', eastAsia: 'ja-JP' } },
        },
        heading1: { run: { font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT }, size: 28, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT }, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 100 } } },
      },
    },
    numbering: { config: numbering },
    sections: [{ properties: { page: PAGE }, children: paragraphs }],
  })
}

// A file name Windows, macOS and phones all accept, from the target's title.
export function docxFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${safe || 'document'}.docx`
}
