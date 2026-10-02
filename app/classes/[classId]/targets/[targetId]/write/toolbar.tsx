'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'

// The formatting toolbar (Prompt 12). Every button has its name as its
// accessible label, aria-pressed for the formats that can be on or off, and
// Word's shortcut in its tooltip. The shortcuts themselves are the editor's
// (Tiptap's defaults plus Indent's Ctrl+M): Ctrl/⌘+B, I, U, Z, Y.
//
// One row that scrolls sideways on a narrow phone, kept at the top of the
// screen while the page scrolls.

type Item = {
  key: string
  label: 'heading1' | 'heading2' | 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'indent' | 'outdent' | 'undo' | 'redo'
  keys?: string
  icon: ReactNode
  run: (editor: Editor) => void
  pressed?: (editor: Editor) => boolean
  enabled?: (editor: Editor) => boolean
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" {...stroke}>
      {children}
    </svg>
  )
}

function Glyph({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={`text-[15px] leading-none ${className}`}>
      {children}
    </span>
  )
}

const ITEMS: (Item | 'sep')[] = [
  {
    key: 'h1',
    label: 'heading1',
    keys: 'Mod+Alt+1',
    icon: <Glyph className="font-bold">H1</Glyph>,
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    pressed: (e) => e.isActive('heading', { level: 1 }),
  },
  {
    key: 'h2',
    label: 'heading2',
    keys: 'Mod+Alt+2',
    icon: <Glyph className="font-bold">H2</Glyph>,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    pressed: (e) => e.isActive('heading', { level: 2 }),
  },
  'sep',
  {
    key: 'bold',
    label: 'bold',
    keys: 'Mod+B',
    icon: <Glyph className="font-bold">B</Glyph>,
    run: (e) => e.chain().focus().toggleBold().run(),
    pressed: (e) => e.isActive('bold'),
  },
  {
    key: 'italic',
    label: 'italic',
    keys: 'Mod+I',
    icon: <Glyph className="font-heading italic">I</Glyph>,
    run: (e) => e.chain().focus().toggleItalic().run(),
    pressed: (e) => e.isActive('italic'),
  },
  {
    key: 'underline',
    label: 'underline',
    keys: 'Mod+U',
    icon: <Glyph className="underline underline-offset-2">U</Glyph>,
    run: (e) => e.chain().focus().toggleUnderline().run(),
    pressed: (e) => e.isActive('underline'),
  },
  'sep',
  {
    key: 'bullets',
    label: 'bulletList',
    keys: 'Mod+Shift+8',
    icon: (
      <Svg>
        <circle cx="4" cy="5.5" r="1" fill="currentColor" />
        <circle cx="4" cy="10" r="1" fill="currentColor" />
        <circle cx="4" cy="14.5" r="1" fill="currentColor" />
        <path d="M8 5.5h9M8 10h9M8 14.5h9" />
      </Svg>
    ),
    run: (e) => e.chain().focus().toggleBulletList().run(),
    pressed: (e) => e.isActive('bulletList'),
  },
  {
    key: 'numbers',
    label: 'orderedList',
    keys: 'Mod+Shift+7',
    icon: (
      <Svg>
        <path d="M3 4h1.5v3.5M3 7.5h3M3 12.5c0-1 2.8-1 2.8 0S3 14 3 15.5h3" strokeWidth={1.3} />
        <path d="M9 5.5h8M9 10h8M9 14.5h8" />
      </Svg>
    ),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    pressed: (e) => e.isActive('orderedList'),
  },
  {
    key: 'indent',
    label: 'indent',
    keys: 'Mod+M',
    icon: (
      <Svg>
        <path d="M3 4h14M9 8h8M9 12h8M3 16h14M3 8l3 2-3 2" />
      </Svg>
    ),
    run: (e) => e.chain().focus().indent().run(),
    enabled: (e) => e.can().indent(),
  },
  {
    key: 'outdent',
    label: 'outdent',
    keys: 'Mod+Shift+M',
    icon: (
      <Svg>
        <path d="M3 4h14M9 8h8M9 12h8M3 16h14M6 8l-3 2 3 2" />
      </Svg>
    ),
    run: (e) => e.chain().focus().outdent().run(),
    enabled: (e) => e.can().outdent(),
  },
  'sep',
  {
    key: 'undo',
    label: 'undo',
    keys: 'Mod+Z',
    icon: (
      <Svg>
        <path d="M7 5L3.5 8.5 7 12M4 8.5h7.5a4.5 4.5 0 010 9H9" />
      </Svg>
    ),
    run: (e) => e.chain().focus().undo().run(),
    enabled: (e) => e.can().undo(),
  },
  {
    key: 'redo',
    label: 'redo',
    keys: 'Mod+Y',
    icon: (
      <Svg>
        <path d="M13 5l3.5 3.5L13 12M16 8.5H8.5a4.5 4.5 0 000 9H11" />
      </Svg>
    ),
    run: (e) => e.chain().focus().redo().run(),
    enabled: (e) => e.can().redo(),
  },
]

const buttons = ITEMS.filter((i): i is Item => i !== 'sep')

function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes('Mac OS X')
}

export function Toolbar({ editor }: { editor: Editor | null }) {
  const t = useTranslations('editor.toolbar')
  // Shown as Ctrl until the browser says it's a Mac or an iPhone.
  const [apple, setApple] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator only exists in the browser, after hydration
    setApple(isApple())
  }, [])

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? Object.fromEntries(
            buttons.map((b) => [b.key, { pressed: b.pressed?.(e) ?? null, enabled: b.enabled?.(e) ?? true }])
          )
        : null,
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  })

  const keysText = (keys: string) =>
    keys
      .replace('Mod', apple ? '⌘' : 'Ctrl')
      .replace('Alt', apple ? '⌥' : 'Alt')
      .replace('Shift', apple ? '⇧' : 'Shift')
      .replaceAll('+', apple ? '' : '+')

  return (
    <div
      role="toolbar"
      aria-label={t('label')}
      aria-controls="document-editor"
      className="sticky top-0 z-10 -mx-5 flex gap-0.5 overflow-x-auto border-y border-border bg-surface px-5 py-1 sm:mx-0 sm:rounded-[2px] sm:border-x"
    >
      {ITEMS.map((item, i) => {
        if (item === 'sep') return <span key={`sep-${i}`} aria-hidden className="mx-1 my-2 w-px shrink-0 bg-border" />
        const s = state?.[item.key]
        const label = t(item.label)
        return (
          <button
            key={item.key}
            type="button"
            aria-label={label}
            title={item.keys ? t('shortcut', { label, keys: keysText(item.keys) }) : label}
            {...(item.pressed ? { 'aria-pressed': s?.pressed ?? false } : {})}
            disabled={!editor || s?.enabled === false}
            // Keep the selection in the text when a button is clicked.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor && item.run(editor)}
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[2px] px-2 text-ink aria-pressed:bg-ink aria-pressed:text-surface disabled:opacity-40"
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}
