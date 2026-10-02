import { Extension, type Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

// 「Study Pods で書く」 (Prompt 12): the one list of editor extensions. The
// editor, the read-only preview and the server's check (lib/doc-schema.ts)
// all build their schema from it, so what the editor can make is exactly
// what the server accepts.
//
// Kept from StarterKit: paragraphs, headings 1–2, bold, italic, underline,
// bullet and numbered lists, line breaks, undo/redo. Switched off: code, code
// blocks, quotes, strikethrough, links and horizontal rules. Pasted content
// that uses them keeps its text and loses the rest.

export const MAX_INDENT = 4
export const HEADING_LEVELS = [1, 2] as const

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      // 字下げ: one more level (2 字 each, up to MAX_INDENT). In a list it
      // nests the item instead, as Word does.
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

const INDENTABLE = ['paragraph', 'heading']

function clampIndent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 0) return 0
  return Math.min(n, MAX_INDENT)
}

// A paragraph or heading's left indent, outside lists. Stored as
// attrs.indent (0–4) and drawn as 2em per level.
export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: INDENTABLE,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => clampIndent(element.getAttribute('data-indent')),
            renderHTML: (attributes) =>
              attributes.indent
                ? { 'data-indent': attributes.indent, style: `margin-left: ${attributes.indent * 2}em` }
                : {},
          },
        },
      },
    ]
  },

  addCommands() {
    const shift =
      (step: 1 | -1) =>
      () =>
      ({ state, tr, dispatch, commands }: import('@tiptap/core').CommandProps) => {
        if (this.editor.isActive('listItem')) {
          return step === 1 ? commands.sinkListItem('listItem') : commands.liftListItem('listItem')
        }
        const { from, to } = state.selection
        let changed = false
        state.doc.nodesBetween(from, to, (node, pos, parent) => {
          if (!INDENTABLE.includes(node.type.name) || parent?.type.name === 'listItem') return
          const next = clampIndent((node.attrs.indent ?? 0) + step)
          if (next !== node.attrs.indent) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
            changed = true
          }
        })
        if (changed && dispatch) dispatch(tr)
        return changed
      }
    return { indent: shift(1), outdent: shift(-1) }
  },

  // Word's shortcuts: Ctrl+M indents, Ctrl+Shift+M outdents. Tab is left to
  // the browser outside lists, so keyboard users can still leave the editor.
  addKeyboardShortcuts() {
    return {
      'Mod-m': () => this.editor.commands.indent(),
      'Mod-Shift-m': () => this.editor.commands.outdent(),
    }
  },
})

export function editorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      code: false,
      codeBlock: false,
      blockquote: false,
      strike: false,
      link: false,
      horizontalRule: false,
    }),
    Indent,
  ]
}
