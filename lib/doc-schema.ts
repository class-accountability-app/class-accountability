import { getSchema, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { countDocument, type DocNode } from './char-count'
import { HEADING_LEVELS, MAX_INDENT, editorExtensions } from './editor-extensions'

// The server's check of a document before it is saved (Prompt 12). The
// browser's JSON is never trusted: it must be exactly what the editor can
// make (lib/editor-extensions.ts), and the count is recounted here.
//
// Two passes: a strict walk (only known nodes, marks and attribute values,
// and a depth limit, so a deeply nested payload can't exhaust the stack),
// then ProseMirror's own schema check (which child may go where). The JSON
// that is stored is ProseMirror's re-serialisation, not the input.

// The same limits as 0019 (documents_content_size, char_count).
export const MAX_DOCUMENT_CHARS = 100_000
export const MAX_DOCUMENT_BYTES = 1_000_000
// doc > list > item > list > item … : 24 allows lists nested 10 deep.
export const MAX_DEPTH = 24

export type DocumentCheck =
  | { ok: true; content: JSONContent; count: number }
  | { ok: false; error: 'documentInvalid' | 'documentTooLong' }

type Attrs = Record<string, unknown>
type AttrRule = (value: unknown) => boolean

const isIndent: AttrRule = (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_INDENT

const NODE_ATTRS: Record<string, Record<string, AttrRule>> = {
  doc: {},
  paragraph: { indent: isIndent },
  heading: { indent: isIndent, level: (v) => (HEADING_LEVELS as readonly unknown[]).includes(v) },
  bulletList: {},
  orderedList: {
    start: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 9999,
    // Tiptap's list style attribute; the editor never sets it.
    type: (v) => v === null,
  },
  listItem: {},
  text: {},
  hardBreak: {},
}

const MARKS = new Set(['bold', 'italic', 'underline'])
const NODE_KEYS = new Set(['type', 'attrs', 'content', 'text', 'marks'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function attrsOk(attrs: unknown, rules: Record<string, AttrRule>): boolean {
  if (attrs === undefined) return true
  if (!isPlainObject(attrs)) return false
  return Object.entries(attrs as Attrs).every(([key, value]) => rules[key]?.(value) ?? false)
}

// Iterative, so depth is checked before anything recurses.
function walkOk(root: unknown): boolean {
  const stack: { node: unknown; depth: number }[] = [{ node: root, depth: 1 }]
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    if (depth > MAX_DEPTH || !isPlainObject(node)) return false
    if (!Object.keys(node).every((k) => NODE_KEYS.has(k))) return false
    const type = node.type
    if (typeof type !== 'string' || !(type in NODE_ATTRS)) return false
    if (depth === 1 && type !== 'doc') return false
    if (!attrsOk(node.attrs, NODE_ATTRS[type])) return false

    if (type === 'text') {
      if (typeof node.text !== 'string' || node.text.length === 0 || node.content !== undefined) return false
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) return false
        for (const mark of node.marks) {
          if (!isPlainObject(mark) || typeof mark.type !== 'string' || !MARKS.has(mark.type)) return false
          if (Object.keys(mark).some((k) => k !== 'type' && k !== 'attrs')) return false
          if (mark.attrs !== undefined && !(isPlainObject(mark.attrs) && Object.keys(mark.attrs).length === 0)) {
            return false
          }
        }
      }
      continue
    }
    if (node.text !== undefined || node.marks !== undefined) return false
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return false
      for (const child of node.content) stack.push({ node: child, depth: depth + 1 })
    }
  }
  return true
}

let schema: Schema | null = null
function editorSchema(): Schema {
  schema ??= getSchema(editorExtensions())
  return schema
}

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

export function checkDocument(input: unknown): DocumentCheck {
  let size: number
  try {
    size = byteLength(input)
  } catch {
    return { ok: false, error: 'documentInvalid' }
  }
  if (size > MAX_DOCUMENT_BYTES) return { ok: false, error: 'documentTooLong' }
  if (!walkOk(input)) return { ok: false, error: 'documentInvalid' }

  let content: JSONContent
  try {
    const node = editorSchema().nodeFromJSON(input)
    node.check()
    content = node.toJSON() as JSONContent
  } catch {
    return { ok: false, error: 'documentInvalid' }
  }

  const count = countDocument(content as DocNode)
  if (count > MAX_DOCUMENT_CHARS) return { ok: false, error: 'documentTooLong' }
  if (byteLength(content) > MAX_DOCUMENT_BYTES) return { ok: false, error: 'documentTooLong' }
  return { ok: true, content, count }
}

export const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
