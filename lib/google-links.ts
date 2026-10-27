// Google auto-logging, the app side: pure helpers for the connect flow, the
// link page and the group Doc (docs/plans/automation-plan.md, section 1).

import { UNIVERSITY_EMAIL_DOMAIN } from './errors'

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

// 0023's label: 1–60 characters, no control characters.
export function sourceLabel(title: string): string {
  const clean = title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  const chars = [...clean]
  return (chars.length > 60 ? chars.slice(0, 60).join('') : clean) || 'Google'
}

export type GroupDocTask = { id: string; title: string; ownerName: string | null }

// The group Doc's text: the project title, then one heading per task ("Script
// — Aki"), each followed by an empty line to write in. Returns the text and,
// for each line, the paragraph style to give it.
export function groupDocOutline(projectTitle: string, tasks: readonly GroupDocTask[]) {
  const lines: { text: string; style: 'TITLE' | 'HEADING_1' | 'NORMAL_TEXT'; taskId?: string }[] = [
    { text: projectTitle, style: 'TITLE' },
  ]
  for (const t of tasks) {
    lines.push({ text: t.ownerName ? `${t.title} — ${t.ownerName}` : t.title, style: 'HEADING_1', taskId: t.id })
    lines.push({ text: '', style: 'NORMAL_TEXT' })
  }
  return lines
}

// Docs API batchUpdate requests that write the outline into a new, empty
// document. Indexes are UTF-16 code units from 1 (the body's start), as the
// API counts them; every line ends in "\n".
export function groupDocRequests(lines: ReturnType<typeof groupDocOutline>): unknown[] {
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

// Who the group Doc is shared with (a Drive API permission): "anyone with the
// link can edit" first; when the student's Google account doesn't allow that
// (a university Workspace often doesn't), anyone at the university with the
// link. Every podmate signs in with a university address.
export function groupDocPermission(audience: 'anyone' | 'university') {
  return audience === 'anyone'
    ? { type: 'anyone', role: 'writer', allowFileDiscovery: false }
    : { type: 'domain', domain: UNIVERSITY_EMAIL_DOMAIN, role: 'writer', allowFileDiscovery: false }
}

// Google's short reason for a refused call ("invalidSharingRequest"), for the
// server log. Only a plain word: Google's messages can name people's addresses.
export function googleErrorReason(body: unknown): string | null {
  const error = (body as { error?: { errors?: { reason?: unknown }[]; status?: unknown } } | null)?.error
  const reason = error?.errors?.[0]?.reason ?? error?.status
  return typeof reason === 'string' && /^[A-Za-z_]{1,64}$/.test(reason) ? reason : null
}
