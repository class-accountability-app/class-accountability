'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, logServerError, toErrorKey, type ActionResult, type ErrorKey } from '@/lib/errors'
import { groupDocOutline, groupDocRequests, isFileId, isHeadingId, sourceLabel } from '@/lib/google-links'
import { myAccessToken, type MyToken } from '@/lib/google-server'
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
  input: { kind: 'doc' | 'doc_section' | 'slides'; fileId: string; label: string; headingId?: string | null }
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

// グループのドキュメントをつくる: a Google Doc in this student's Drive with the
// project title and one heading per characters task, link sharing ("anyone
// with the link can edit"; the link is shown only on the pod's board, the
// author's choice of 2026-10-26), and every such task linked to its heading.
export async function createGroupDoc(classId: string, projectId: string): Promise<ActionResult> {
  const me = await signedIn()
  if (!me) return { error: 'signedOut' }
  const token = await myAccessToken(me.supabase)
  if (!token.ok) return { error: TOKEN_ERRORS[token.reason] }

  const [{ data: project }, { data: tasks }] = await Promise.all([
    me.supabase.from('projects').select('id, title, pairing_id').eq('id', projectId).maybeSingle(),
    me.supabase
      .from('project_tasks')
      .select('id, title, owner_id, metric, input_mode, profiles(display_name)')
      .eq('project_id', projectId)
      .eq('metric', 'characters')
      .eq('input_mode', 'manual')
      .order('position')
      .order('created_at'),
  ])
  if (!project) return { error: 'notAllowed' }
  const writable = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    ownerName: (t.profiles as unknown as { display_name: string } | null)?.display_name ?? null,
  }))
  if (writable.length === 0) return { error: 'groupDocNoTasks' }

  const auth = { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' }
  const created = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: project.title }),
  })
  if (!created.ok) {
    logServerError('createGroupDoc.create', { code: String(created.status) })
    return { error: 'googleFailed' }
  }
  const { documentId } = (await created.json()) as { documentId?: string }
  if (!documentId || !isFileId(documentId)) return { error: 'googleFailed' }

  const lines = groupDocOutline(project.title, writable)
  const [written, shared] = await Promise.all([
    fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ requests: groupDocRequests(lines) }),
    }),
    fetch(`https://www.googleapis.com/drive/v3/files/${documentId}/permissions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ type: 'anyone', role: 'writer', allowFileDiscovery: false }),
    }),
  ])
  if (!written.ok || !shared.ok) {
    logServerError('createGroupDoc.setup', { code: `${written.status}/${shared.status}` })
    return { error: 'googleFailed' }
  }

  // The headings now have ids, in the same order as the tasks.
  const doc = await fetchDoc(token.accessToken, documentId)
  if (!doc.ok) return { error: 'googleFailed' }
  const headings = docHeadings(doc.value)
  if (headings.length !== writable.length) return { error: 'googleFailed' }

  for (let i = 0; i < writable.length; i++) {
    const { error } = await me.supabase.rpc('link_task_source', {
      p_task: writable[i].id,
      p_kind: 'doc_section',
      p_file_id: documentId,
      p_label: sourceLabel(writable[i].title),
      p_heading_id: headings[i].headingId,
    })
    if (error) return { error: toErrorKey('createGroupDoc.link', error, { [DB_CODES.taskSourceMismatch]: 'googleFileMismatch' }) }
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
