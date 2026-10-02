import { describe, expect, it } from 'vitest'
import { MAX_DEPTH, checkDocument, checkDocumentJson } from './doc-schema'

const p = (text: string, attrs?: Record<string, unknown>) => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: [{ type: 'text', text }],
})
const doc = (...content: unknown[]) => ({ type: 'doc', content })

describe('checkDocument', () => {
  it('accepts everything the editor makes, and recounts', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 1, indent: 0 }, content: [{ type: 'text', text: 'はじめに' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '背景' }] },
      {
        type: 'paragraph',
        attrs: { indent: 2 },
        content: [
          { type: 'text', text: '本研究は', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'hardBreak' },
          { type: 'text', text: '重要', marks: [{ type: 'underline' }] },
        ],
      },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('一つ目')] }] },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [
          {
            type: 'listItem',
            content: [p('二つ目'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('入れ子')] }] }],
          },
        ],
      },
      { type: 'paragraph' }
    )
    const result = checkDocument(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.count).toBe(4 + 2 + 4 + 2 + 3 + 3 + 3)
  })

  it('accepts the empty document', () => {
    expect(checkDocument(doc({ type: 'paragraph' }))).toMatchObject({ ok: true, count: 0 })
  })

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['an array', [doc(p('a'))]],
    ['a root that is not doc', p('a')],
    ['an unknown node', doc({ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] })],
    ['a quote', doc({ type: 'blockquote', content: [p('x')] })],
    ['an image', doc({ type: 'image', attrs: { src: 'https://example.com/x.png' } })],
    ['heading level 3', doc({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'x' }] })],
    ['indent 5', doc(p('x', { indent: 5 }))],
    ['indent -1', doc(p('x', { indent: -1 }))],
    ['indent 1.5', doc(p('x', { indent: 1.5 }))],
    ['indent as a string', doc(p('x', { indent: '2' }))],
    ['an unknown attribute', doc(p('x', { style: 'color:red' }))],
    ['an unknown key on a node', doc({ ...p('x'), html: '<b>x</b>' })],
    ['a link mark', doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] })],
    ['a mark with attributes', doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold', attrs: { x: 1 } }] }] })],
    ['empty text', doc({ type: 'paragraph', content: [{ type: 'text', text: '' }] })],
    ['text with content', doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', content: [] }] })],
    ['text directly in doc', doc({ type: 'text', text: 'x' })],
    ['a paragraph in a paragraph', doc({ type: 'paragraph', content: [p('x')] })],
    ['a list without items', doc({ type: 'bulletList', content: [] })],
    ['an ordered list type', doc({ type: 'orderedList', attrs: { type: 'a' }, content: [{ type: 'listItem', content: [p('x')] }] })],
  ])('refuses %s', (_name, input) => {
    expect(checkDocument(input)).toEqual({ ok: false, error: 'documentInvalid' })
  })

  it('refuses nesting deeper than the limit without recursing', () => {
    let node: Record<string, unknown> = p('x')
    for (let i = 0; i < MAX_DEPTH; i++) {
      node = { type: 'bulletList', content: [{ type: 'listItem', content: [p('y'), node] }] }
    }
    expect(checkDocument(doc(node))).toEqual({ ok: false, error: 'documentInvalid' })

    let deep: Record<string, unknown> = { type: 'doc' }
    for (let i = 0; i < 100_000; i++) deep = { type: 'doc', content: [deep] }
    expect(() => checkDocument(deep)).not.toThrow()
  })

  it('refuses more than 100,000 characters', () => {
    expect(checkDocument(doc(p('あ'.repeat(100_000))))).toMatchObject({ ok: true, count: 100_000 })
    expect(checkDocument(doc(p('あ'.repeat(100_001))))).toEqual({ ok: false, error: 'documentTooLong' })
  })

  it('refuses more than 1 MB of JSON, before anything else', () => {
    const big = doc(...Array.from({ length: 40_000 }, () => ({ type: 'paragraph', attrs: { indent: 0 } })))
    expect(checkDocument(big)).toEqual({ ok: false, error: 'documentTooLong' })
  })

  it('stores ProseMirror’s serialisation, with default attributes filled in', () => {
    const result = checkDocument(doc(p('x')))
    expect(result.ok && result.content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'x' }] }],
    })
  })
})

describe('checkDocumentJson (what the browser sends)', () => {
  it('parses a JSON string and checks it', () => {
    const text = JSON.stringify({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2, indent: 0 }, content: [{ type: 'text', text: '背景' }] }] })
    expect(checkDocumentJson(text)).toMatchObject({ ok: true, count: 2 })
  })

  it('keeps attributes that a null-prototype object would lose in transit', () => {
    const attrs = Object.assign(Object.create(null), { level: 2, indent: 1 })
    const text = JSON.stringify({ type: 'doc', content: [{ type: 'heading', attrs, content: [{ type: 'text', text: 'x' }] }] })
    const result = checkDocumentJson(text)
    expect(result.ok && result.content.content?.[0].attrs).toEqual({ indent: 1, level: 2 })
  })

  it.each([
    ['an object instead of a string', { type: 'doc', content: [] }],
    ['not JSON', '{"type":"doc",'],
    ['null', null],
  ])('refuses %s', (_name, input) => {
    expect(checkDocumentJson(input)).toEqual({ ok: false, error: 'documentInvalid' })
  })

  it('refuses a string over 1 MB before parsing it', () => {
    expect(checkDocumentJson('"' + 'x'.repeat(1_000_001) + '"')).toEqual({ ok: false, error: 'documentTooLong' })
  })
})

describe('the stored JSON', () => {
  it('is plain objects all the way down (a server action can return it)', () => {
    const result = checkDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'x' }] }] })
    const plain = (v: unknown): boolean =>
      typeof v !== 'object' || v === null || (Array.isArray(v) ? v.every(plain) : Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain))
    expect(result.ok && plain(result.content)).toBe(true)
  })
})
