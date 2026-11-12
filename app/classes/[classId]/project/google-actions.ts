'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, logServerError, toErrorKey, type ActionResult, type ErrorKey } from '@/lib/errors'
import {
  googleErrorReason,
  groupDocRequests,
  fileNameFor,
  isFileId,
  taskDocOutline,
  isHeadingId,
  sourceLabel,
} from '@/lib/google-links'
import { myAccessToken, type MyToken } from '@/lib/google-server'
import { getLocale } from 'next-intl/server'
import { docTemplateSections, parseDocTemplate } from '@/lib/doc-templates'
import { parseSlideTemplate, slideTemplateRequests, slideTemplateSections } from '@/lib/slide-templates'
import { parseSheetTemplate, sheetCreateBody, sheetTemplateColumns } from '@/lib/sheet-templates'
import { fetchDoc, revokeToken } from '@/supabase/functions/_shared/google-api'
import { docHeadings } from '@/supabase/functions/_shared/google-count'

// Google auto-logging (0023, 0026). Everything here runs as the signed-in
// student with their own Google connection; counts are never written here
// (only the sync-google-progress Edge Function writes them).

type Supabase = Awaited<ReturnType<typeof createClient>>

const TOKEN_ERRORS: Record<Exclude<MyToken, { ok: true }>['reason'], ErrorKey> = {
  unavailable: 'googleUnavailable',
  notConnected: 'googleNotConnected',
  reconnect: 'googleReconnect',
  failed: 'googleFailed',
}

async function signedIn(): Promise<{ supabase: Supabase; userId: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { supabase, userId: user.id } : null
}

function refresh(classId: string) {
  revalidatePath(`/classes/${classId}/project`)
}

// A short-lived access token for Google's file picker in this student's own
// browser (drive.file: picking a file is what grants the app access to it).
export async function googlePickerToken(): Promise<{ error: ErrorKey | null; token?: string }> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  const token = await myAccessToken(me.supabase)
  return token.ok ? { error: null, token: token.accessToken } : { error: TOKEN_ERRORS[token.reason] }
}

// The headings of a Doc this student can open, for linking a task to a section.
export async function googleDocHeadings(fileId: string): Promise<{ error: ErrorKey | null; headings?: { id: string; text: string }[] }> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  if (!isFileId(fileId)) return { error: 'googleFailed' }
  const token = await myAccessToken(me.supabase)
  if (!token.ok) return { error: TOKEN_ERRORS[token.reason] }
  const doc = await fetchDoc(token.accessToken, fileId)
  if (!doc.ok) return { error: doc.reason === 'lost' ? 'googleFileLost' : 'googleFailed' }
  return { error: null, headings: docHeadings(doc.value).map((h) => ({ id: h.headingId, text: h.text })) }
}

export async function linkTaskSource(
  classId: string,
  taskId: string,
  input: { kind: 'doc' | 'doc_section' | 'slides' | 'doc_words' | 'sheet'; fileId: string; label: string; headingId?: string | null }
): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  if (!isFileId(input.fileId)) return { error: 'googleFailed' }
  if (input.kind === 'doc_section' ? !isHeadingId(input.headingId) : input.headingId) return { error: 'googleFailed' }

  const { error } = await me.supabase.rpc('link_task_source', {
    p_task: taskId,
    p_kind: input.kind,
    p_file_id: input.fileId,
    p_label: sourceLabel(input.label),
    p_heading_id: input.kind === 'doc_section' ? input.headingId : null,
  })
  if (error) {
    return {
      error: toErrorKey('linkTaskSource', error, {
        [DB_CODES.googleNotConnected]: 'googleNotConnected',
        [DB_CODES.taskSourceMismatch]: 'googleFileMismatch',
      }),
    }
  }
  await me.supabase.rpc('request_google_sync')
  refresh(classId)
  return { error: null }
}

export async function unlinkTaskSource(classId: string, taskId: string): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  const { error } = await me.supabase.rpc('unlink_task_source', { p_task: taskId })
  if (error) return { error: toErrorKey('unlinkTaskSource', error) }
  refresh(classId)
  return { error: null }
}

// A new file's name in Drive and on the board (2026-11-08): the task's title
// and its owner's display name, e.g. 「台本（あき）」, so everyone can tell whose
// file it is and which task it belongs to.
async function myFileName(supabase: Supabase, userId: string, taskTitle: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  const en = (await getLocale()) === 'en'
  return fileNameFor(taskTitle, data?.display_name ?? null, en)
}

type GoogleAuth = { Authorization: string; 'Content-Type': string }

// A refused Google call as "400:invalidSharingRequest" (or just the status),
// for logServerError.
async function googleFailure(res: Response): Promise<string> {
  const reason = googleErrorReason(await res.json().catch(() => null))
  return reason ? `${res.status}:${reason}` : String(res.status)
}

// Best effort; drive.file lets the app trash only files it created.
async function trashFile(auth: GoogleAuth, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ trashed: true }),
  }).catch(() => null)
  if (!res?.ok) logServerError('google.trash', { code: res ? await googleFailure(res) : 'network' })
}

// テンプレートから新しいドキュメントを作る (2026-11-08): a Google Doc in my own
// Drive for my characters task, titled like the task, with a template's
// sections as headings (or none), linked to the task as a whole Doc. It is not
// shared: the owner writes in it. Headings aren't counted, so it starts at 0.
export async function createTaskDoc(classId: string, taskId: string, template?: string): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }

  const { data: task } = await me.supabase
    .from('project_tasks')
    .select('id, title, owner_id, metric, input_mode, projects!inner(status)')
    .eq('id', taskId)
    .maybeSingle()
  if (!task || task.owner_id !== me.userId || task.metric !== 'characters' || task.input_mode !== 'manual') {
    return { error: 'notAllowed' }
  }
  if ((task.projects as unknown as { status: string }).status !== 'active') return { error: 'projectFinished' }
  const fileName = await myFileName(me.supabase, me.userId, task.title)

  const token = await myAccessToken(me.supabase)
  if (!token.ok) return { error: TOKEN_ERRORS[token.reason] }
  const auth: GoogleAuth = { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' }

  const created = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: fileName }),
  })
  if (!created.ok) {
    logServerError('createTaskDoc.create', { code: await googleFailure(created) })
    return { error: 'googleFailed' }
  }
  const { documentId } = (await created.json()) as { documentId?: string }
  if (!documentId || !isFileId(documentId)) return { error: 'googleFailed' }

  const sections = docTemplateSections(parseDocTemplate(template), await getLocale())
  const written = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ requests: groupDocRequests(taskDocOutline(task.title, sections)) }),
  })
  if (!written.ok) {
    logServerError('createTaskDoc.write', { code: await googleFailure(written) })
    await trashFile(auth, documentId)
    return { error: 'googleFailed' }
  }

  const { error } = await me.supabase.rpc('link_task_source', {
    p_task: taskId,
    p_kind: 'doc',
    p_file_id: documentId,
    p_label: fileName,
    p_heading_id: null,
  })
  if (error) {
    await trashFile(auth, documentId)
    return {
      error: toErrorKey('createTaskDoc.link', error, {
        [DB_CODES.googleNotConnected]: 'googleNotConnected',
        [DB_CODES.taskSourceMismatch]: 'googleFileMismatch',
      }),
    }
  }

  await me.supabase.rpc('request_google_sync')
  refresh(classId)
  return { error: null }
}

// テンプレートから新しいスプレッドシートを作る (2026-11-08): a Google Sheet in
// my own Drive for my counted task, its first row the template's columns,
// linked as 'sheet' (filled rows less the header, so it starts at 0). Not
// shared.
export async function createTaskSheet(classId: string, taskId: string, template?: string): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  const key = parseSheetTemplate(template)
  if (!key) return { error: 'googleFailed' }

  const { data: task } = await me.supabase
    .from('project_tasks')
    .select('id, title, owner_id, metric, input_mode, projects!inner(status)')
    .eq('id', taskId)
    .maybeSingle()
  if (!task || task.owner_id !== me.userId || task.metric !== 'count' || task.input_mode !== 'manual') {
    return { error: 'notAllowed' }
  }
  if ((task.projects as unknown as { status: string }).status !== 'active') return { error: 'projectFinished' }
  const fileName = await myFileName(me.supabase, me.userId, task.title)

  const token = await myAccessToken(me.supabase)
  if (!token.ok) return { error: TOKEN_ERRORS[token.reason] }
  const auth: GoogleAuth = { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' }

  const created = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(sheetCreateBody(fileName, sheetTemplateColumns(key, await getLocale()))),
  })
  if (!created.ok) {
    logServerError('createTaskSheet.create', { code: await googleFailure(created) })
    return { error: 'googleFailed' }
  }
  const { spreadsheetId: fileId } = (await created.json()) as { spreadsheetId?: string }
  if (!fileId || !isFileId(fileId)) return { error: 'googleFailed' }

  const { error } = await me.supabase.rpc('link_task_source', {
    p_task: taskId,
    p_kind: 'sheet',
    p_file_id: fileId,
    p_label: fileName,
    p_heading_id: null,
  })
  if (error) {
    await trashFile(auth, fileId)
    return {
      error: toErrorKey('createTaskSheet.link', error, {
        [DB_CODES.googleNotConnected]: 'googleNotConnected',
        [DB_CODES.taskSourceMismatch]: 'googleFileMismatch',
      }),
    }
  }

  await me.supabase.rpc('request_google_sync')
  refresh(classId)
  return { error: null }
}

// テンプレートから新しいスライドを作る (2026-11-08): a Google Slides deck in my
// own Drive for my counted task: a cover with the task's title and one slide
// per section, linked as 'slides'. Template slides count only once something
// besides the title is on them, so the deck starts at 0. Not shared.
export async function createTaskSlides(classId: string, taskId: string, template?: string): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }

  const { data: task } = await me.supabase
    .from('project_tasks')
    .select('id, title, owner_id, metric, input_mode, projects!inner(status)')
    .eq('id', taskId)
    .maybeSingle()
  if (!task || task.owner_id !== me.userId || task.metric !== 'count' || task.input_mode !== 'manual') {
    return { error: 'notAllowed' }
  }
  if ((task.projects as unknown as { status: string }).status !== 'active') return { error: 'projectFinished' }
  const fileName = await myFileName(me.supabase, me.userId, task.title)

  const token = await myAccessToken(me.supabase)
  if (!token.ok) return { error: TOKEN_ERRORS[token.reason] }
  const auth: GoogleAuth = { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' }

  const created = await fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: fileName }),
  })
  if (!created.ok) {
    logServerError('createTaskSlides.create', { code: await googleFailure(created) })
    return { error: 'googleFailed' }
  }
  const deck = (await created.json()) as { presentationId?: string; slides?: { objectId?: string }[] }
  const fileId = deck.presentationId
  if (!fileId || !isFileId(fileId)) return { error: 'googleFailed' }

  const sections = slideTemplateSections(parseSlideTemplate(template), await getLocale())
  const written = await fetch(`https://slides.googleapis.com/v1/presentations/${fileId}:batchUpdate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ requests: slideTemplateRequests(task.title, sections, deck.slides?.[0]?.objectId ?? null) }),
  })
  if (!written.ok) {
    logServerError('createTaskSlides.write', { code: await googleFailure(written) })
    await trashFile(auth, fileId)
    return { error: 'googleFailed' }
  }

  const { error } = await me.supabase.rpc('link_task_source', {
    p_task: taskId,
    p_kind: 'slides',
    p_file_id: fileId,
    p_label: fileName,
    p_heading_id: null,
  })
  if (error) {
    await trashFile(auth, fileId)
    return {
      error: toErrorKey('createTaskSlides.link', error, {
        [DB_CODES.googleNotConnected]: 'googleNotConnected',
        [DB_CODES.taskSourceMismatch]: 'googleFileMismatch',
      }),
    }
  }

  await me.supabase.rpc('request_google_sync')
  refresh(classId)
  return { error: null }
}

// Opening the board: ask the Edge Function for a re-count (at most once per
// 2 minutes per student; the database decides). True when one was asked for.
export async function requestGoogleSync(): Promise<boolean> {
  const me = await signedIn()
  if (!me) return false
  const { data, error } = await me.supabase.rpc('request_google_sync')
  if (error) {
    logServerError('requestGoogleSync', error)
    return false
  }
  return data === true
}

// 設定 → Google の連携を解除: revoke at Google (best effort), then delete my row;
// the links I made show "can't read" until someone relinks.
export async function disconnectGoogle(): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  const token = await myAccessToken(me.supabase)
  if (token.ok) await revokeToken(token.refreshToken)
  const { error } = await me.supabase.rpc('delete_my_google_credentials')
  if (error) return { error: toErrorKey('disconnectGoogle', error) }
  revalidatePath('/settings')
  return { error: null }
}
