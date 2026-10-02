import type { JSONContent } from '@tiptap/core'
import type { ReactNode } from 'react'

// A document (Prompt 12) as plain React elements: the history preview and
// the print/PDF page. Built from the JSON node by node, never from HTML, so
// nothing in a document can become markup. Unknown nodes and marks render
// as nothing (the server only stores what lib/doc-schema.ts allows anyway).

function indentStyle(node: JSONContent) {
  const n = Number(node.attrs?.indent ?? 0)
  return Number.isInteger(n) && n > 0 ? { marginLeft: `${Math.min(n, 4) * 2}em` } : undefined
}

function inline(nodes: JSONContent[] | undefined): ReactNode[] {
  return (nodes ?? []).map((node, i) => {
    if (node.type === 'hardBreak') return <br key={i} />
    if (node.type !== 'text' || !node.text) return null
    let out: ReactNode = node.text
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') out = <strong>{out}</strong>
      else if (mark.type === 'italic') out = <em>{out}</em>
      else if (mark.type === 'underline') out = <u>{out}</u>
    }
    return <span key={i}>{out}</span>
  })
}

function block(node: JSONContent, key: number): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} style={indentStyle(node)}>
          {node.content?.length ? inline(node.content) : <br />}
        </p>
      )
    case 'heading':
      return node.attrs?.level === 2 ? (
        <h3 key={key} style={indentStyle(node)}>
          {inline(node.content)}
        </h3>
      ) : (
        <h2 key={key} style={indentStyle(node)}>
          {inline(node.content)}
        </h2>
      )
    case 'bulletList':
      return <ul key={key}>{(node.content ?? []).map(listItem)}</ul>
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (
        <ol key={key} start={Number.isInteger(start) && start > 1 ? start : undefined}>
          {(node.content ?? []).map(listItem)}
        </ol>
      )
    }
    default:
      return null
  }
}

function listItem(node: JSONContent, key: number): ReactNode {
  if (node.type !== 'listItem') return null
  return <li key={key}>{(node.content ?? []).map(block)}</li>
}

// Headings are h2/h3: the page's own h1 is the target's title. The styles
// live in globals.css (.doc-body), shared with the editor.
export function DocView({ content, className = '' }: { content: JSONContent; className?: string }) {
  return <div className={`doc-body ${className}`}>{(content.content ?? []).map(block)}</div>
}
