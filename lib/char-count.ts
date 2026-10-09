// Word's 文字数（スペースを含めない） for a 「Study Pods で書く」 document
// (Prompt 12): every user-perceived character (grapheme cluster, so an emoji
// with a skin tone or a family ZWJ sequence counts once), except whitespace:
// half- and full-width spaces, tabs and line breaks. Paragraph and list
// boundaries add nothing. The server recounts with this same function before
// saving; it never trusts the browser's number.

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })
const WHITESPACE = /^\s+$/u

export function countText(text: string): number {
  let n = 0
  for (const { segment } of segmenter.segment(text)) {
    if (!WHITESPACE.test(segment)) n++
  }
  return n
}

// The editor's JSON (ProseMirror): only text nodes carry characters.
export type DocNode = {
  type: string
  text?: string
  content?: DocNode[]
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export function countDocument(doc: DocNode): number {
  let n = 0
  const walk = (node: DocNode) => {
    if (typeof node.text === 'string') n += countText(node.text)
    node.content?.forEach(walk)
  }
  walk(doc)
  return n
}
