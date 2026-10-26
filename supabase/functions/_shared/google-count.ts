import { countText } from './char-count.ts'

// Counting a linked Google file (0023). Pure functions over what the Docs and
// Slides APIs return; the text is walked in memory, counted and dropped, never
// stored or logged. Used by the sync-google-progress Edge Function and by the
// Next.js server (the heading list when a task is linked to a section).

// The parts of a Docs API document this reads (documents.get).
export type DocsTextRun = { textRun?: { content?: string } }
export type DocsParagraph = {
  elements?: DocsTextRun[]
  paragraphStyle?: { namedStyleType?: string; headingId?: string }
}
export type DocsTable = { tableRows?: { tableCells?: { content?: DocsElement[] }[] }[] }
export type DocsElement = { paragraph?: DocsParagraph; table?: DocsTable }
export type DocsDocument = { body?: { content?: DocsElement[] } }

// The fields to ask for, so the API sends no styling or images.
export const DOC_FIELDS =
  'body(content(paragraph(elements(textRun(content)),paragraphStyle(namedStyleType,headingId)),' +
  'table(tableRows(tableCells(content(paragraph(elements(textRun(content)))))))))'
export const SLIDES_FIELDS = 'slides(objectId)'

// TITLE is above HEADING_1; ordinary paragraphs have no level.
function headingLevel(p: DocsParagraph | undefined): number | null {
  const style = p?.paragraphStyle?.namedStyleType
  if (style === 'TITLE') return 0
  const m = style?.match(/^HEADING_([1-6])$/)
  return m ? Number(m[1]) : null
}

function paragraphText(p: DocsParagraph | undefined): string {
  return (p?.elements ?? []).map((e) => e.textRun?.content ?? '').join('')
}

function elementText(el: DocsElement): string {
  if (el.paragraph) return paragraphText(el.paragraph)
  let text = ''
  for (const row of el.table?.tableRows ?? []) {
    for (const cell of row.tableCells ?? []) {
      for (const inner of cell.content ?? []) text += elementText(inner)
    }
  }
  return text
}

export type DocHeading = { headingId: string; level: number; text: string }

// Every heading a section can be linked to, in order (TITLE has no id).
export function docHeadings(doc: DocsDocument): DocHeading[] {
  const out: DocHeading[] = []
  for (const el of doc.body?.content ?? []) {
    const level = headingLevel(el.paragraph)
    const id = el.paragraph?.paragraphStyle?.headingId
    if (level !== null && level > 0 && id) out.push({ headingId: id, level, text: paragraphText(el.paragraph).trim() })
  }
  return out
}

// Characters in the whole document, or under one heading: from the paragraph
// after it up to the next heading of the same or a higher level (or the end).
// The heading's own line is not counted. Null when the heading is gone.
export function countDoc(doc: DocsDocument, headingId: string | null): number | null {
  const content = doc.body?.content ?? []
  if (headingId === null) return countText(content.map(elementText).join(''))

  const start = content.findIndex((el) => el.paragraph?.paragraphStyle?.headingId === headingId)
  if (start === -1) return null
  const level = headingLevel(content[start].paragraph) ?? 6
  let text = ''
  for (let i = start + 1; i < content.length; i++) {
    const next = headingLevel(content[i].paragraph)
    if (next !== null && next <= level) break
    text += elementText(content[i])
  }
  return countText(text)
}

export function countSlides(presentation: { slides?: unknown[] }): number {
  return presentation.slides?.length ?? 0
}
