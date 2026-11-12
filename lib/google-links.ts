// Google auto-logging, the app side: pure helpers for the connect flow, the
// link page and the group Doc (docs/plans/automation-plan.md, section 1).


// The cookie that ties Google's answer to the browser that asked (connect →
// callback, 10 minutes, httpOnly, path /api/google).
export const OAUTH_COOKIE = 'google_oauth'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const RETURN_PATH = new RegExp(`^/classes/${UUID}/project(/tasks/${UUID}/link)?$`)

// Where to go after Google's consent screen. Only these app pages, so the
// connect link can't be turned into an open redirect.
export function safeReturnPath(raw: string | null | undefined): string {
  return raw && RETURN_PATH.test(raw) ? raw : '/'
}

// Google's file ids are URL-safe (0023 checks the same shape).
export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(value)
}

export function isHeadingId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value)
}

export function docUrl(fileId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`
}

export function slidesUrl(fileId: string): string {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(fileId)}/edit`
}

export function sheetUrl(fileId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/edit`
}

// The file a task is counted from, opened in Google (2026-11-06): Docs for
// the doc kinds, Slides, or Sheets. Google itself decides who may open it.
export type SourceKind = 'doc' | 'doc_section' | 'slides' | 'doc_words' | 'sheet'
export function sourceFileUrl(kind: SourceKind, fileId: string): string {
  if (kind === 'slides') return slidesUrl(fileId)
  if (kind === 'sheet') return sheetUrl(fileId)
  return docUrl(fileId)
}

// 0023's label: 1–60 characters, no control characters.
export function sourceLabel(title: string): string {
  const clean = title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  const chars = [...clean]
  return (chars.length > 60 ? chars.slice(0, 60).join('') : clean) || 'Google'
}

// A new file's name: the task's title and its owner's display name, e.g.
// 「台本（あき）」, within the label's 60 characters. A long title is cut, never
// the name: the name is what tells two teammates' files apart.
export function fileNameFor(taskTitle: string, ownerName: string | null, english: boolean): string {
  const name = ownerName ? sourceLabel(ownerName) : ''
  if (!ownerName?.trim()) return sourceLabel(taskTitle)
  const suffix = english ? ` (${name})` : `（${name}）`
  const room = 60 - [...suffix].length
  if (room < 1) return sourceLabel(taskTitle)
  const title = [...sourceLabel(taskTitle)].slice(0, room).join('').trimEnd()
  return `${title}${suffix}`
}

export type OutlineLine = { text: string; style: 'TITLE' | 'HEADING_1' | 'HEADING_2' | 'NORMAL_TEXT' }

// A new Doc for one task: the task's title, then the template's sections as
// headings with an empty line under each (just one empty line without one).
export function taskDocOutline(taskTitle: string, sections: readonly string[]): OutlineLine[] {
  const lines: OutlineLine[] = [{ text: taskTitle, style: 'TITLE' }]
  if (sections.length === 0) lines.push({ text: '', style: 'NORMAL_TEXT' })
  for (const section of sections) {
    lines.push({ text: section, style: 'HEADING_1' })
    lines.push({ text: '', style: 'NORMAL_TEXT' })
  }
  return lines
}

// Docs API batchUpdate requests that write the outline into a new, empty
// document (named groupDocRequests from the retired group Doc). Indexes are UTF-16 code units from 1 (the body's start), as the
// API counts them; every line ends in "\n".
export function groupDocRequests(lines: readonly OutlineLine[]): unknown[] {
  const text = lines.map((l) => `${l.text}\n`).join('')
  const requests: unknown[] = [{ insertText: { location: { index: 1 }, text } }]
  let index = 1
  for (const line of lines) {
    const end = index + line.text.length + 1
    if (line.style !== 'NORMAL_TEXT') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: index, endIndex: end },
          paragraphStyle: { namedStyleType: line.style },
          fields: 'namedStyleType',
        },
      })
    }
    index = end
  }
  return requests
}

// Google's short reason for a refused call ("invalidSharingRequest"), for the
// server log. Only a plain word: Google's messages can name people's addresses.
export function googleErrorReason(body: unknown): string | null {
  const error = (body as { error?: { errors?: { reason?: unknown }[]; status?: unknown } } | null)?.error
  const reason = error?.errors?.[0]?.reason ?? error?.status
  return typeof reason === 'string' && /^[A-Za-z_]{1,64}$/.test(reason) ? reason : null
}
