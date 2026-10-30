'use server'

import type { JSONContent } from '@tiptap/core'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ErrorKey } from '@/lib/errors'
import { checkDocument, checkDocumentJson } from '@/lib/doc-schema'
import type { RejectReason, Theirs } from '@/lib/autosave'

// 「Study Pods で書く」 (Prompt 12, on tasks since 0030). Every write goes
// through security-definer functions (save_task_document,
// keep_task_document_version), which check that the task is the caller's own
// document task and the text theirs; reads go through RLS (own rows only). Here the JSON is checked against the editor's
// schema and the characters are recounted: the browser's count is never used.
//
// No revalidatePath on save: it would re-render the editor page on every
// autosave. Home and the class pages are dynamic, so they read the new
// totals the next time they are opened.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SaveResult =
  | { status: 'saved'; version: number; updatedAt: string }
  | { status: 'conflict'; theirs: Theirs }
  // Saving again won't help until the text changes.
  | { status: 'rejected'; reason: RejectReason }
  // A database or network problem: try again later.
  | { status: 'failed' }

type SaveRow = { status: 'saved' | 'conflict'; version: number; char_count: number; updated_at: string }

const REJECT_CODES: Partial<Record<string, ErrorKey>> = {
  [DB_CODES.documentTooLong]: 'documentTooLong',
  [DB_CODES.insufficientPrivilege]: 'notOwnTarget',
}

async function signedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

async function readTheirs(supabase: Supabase, taskId: string): Promise<Theirs | null> {
  const { data } = await supabase
    .from('task_documents')
    .select('content, char_count, version, updated_at')
    .eq('task_id', taskId)
    .maybeSingle<{ content: JSONContent; char_count: number; version: number; updated_at: string }>()
  if (!data) return null
  return { content: data.content, charCount: data.char_count, version: data.version, updatedAt: data.updated_at }
}

async function save(
  supabase: Supabase,
  taskId: string,
  expectedVersion: number,
  content: JSONContent,
  count: number,
  keepCurrent: 'conflict' | 'before_restore' | null,
  context: string
): Promise<SaveResult> {
  const { data, error } = await supabase
    .rpc('save_task_document', {
      p_task: taskId,
      p_expected_version: expectedVersion,
      p_content: content,
      p_char_count: count,
      p_keep_current: keepCurrent,
    })
    .single<SaveRow>()

  if (error || !data) {
    const key = toErrorKey(context, error, REJECT_CODES)
    if (key === 'documentTooLong' || key === 'notOwnTarget') return { status: 'rejected', reason: key }
    return { status: 'failed' }
  }
  if (data.status === 'conflict') {
    const theirs = await readTheirs(supabase, taskId)
    return theirs ? { status: 'conflict', theirs } : { status: 'failed' }
  }
  return { status: 'saved', version: data.version, updatedAt: data.updated_at }
}

// Autosave. `keepCurrent` is 'conflict' after この画面の内容を使う: the text
// saved elsewhere becomes a version before this one replaces it.
export async function saveDocument(
  taskId: string,
  expectedVersion: number,
  // JSON.stringify(editor.getJSON()); see checkDocumentJson.
  contentJson: string,
  keepCurrent: 'conflict' | null
): Promise<SaveResult> {
  const { supabase, user } = await signedIn()
  if (!user) return { status: 'rejected', reason: 'signedOut' }
  if (!UUID.test(taskId) || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return { status: 'rejected', reason: 'documentInvalid' }
  }
  const checked = checkDocumentJson(contentJson)
  if (!checked.ok) return { status: 'rejected', reason: checked.error }
  return save(
    supabase,
    taskId,
    expectedVersion,
    checked.content,
    checked.count,
    keepCurrent === 'conflict' ? 'conflict' : null,
    'saveDocument'
  )
}

// 保存されている内容を開く after a conflict: this screen's text is kept as
// a version first, then the editor loads the saved one.
export async function keepMine(
  taskId: string,
  contentJson: string
): Promise<{ error: ErrorKey | null; theirs?: Theirs }> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'signedOut' }
  if (!UUID.test(taskId)) return { error: 'documentNotFound' }
  const checked = checkDocumentJson(contentJson)
  if (!checked.ok) return { error: checked.error }

  const { error } = await supabase.rpc('keep_task_document_version', {
    p_task: taskId,
    p_content: checked.content,
    p_char_count: checked.count,
  })
  if (error) {
    return { error: toErrorKey('keepMine', error, { ...REJECT_CODES, [DB_CODES.insufficientPrivilege]: 'documentNotFound' }) }
  }
  const theirs = await readTheirs(supabase, taskId)
  return theirs ? { error: null, theirs } : { error: 'documentNotFound' }
}

// What the server has now. The editor asks on opening, since a page brought
// back by the browser's Back button can be older than the last save.
export async function currentDocument(taskId: string): Promise<{ theirs: Theirs | null }> {
  const { supabase, user } = await signedIn()
  if (!user || !UUID.test(taskId)) return { theirs: null }
  return { theirs: await readTheirs(supabase, taskId) }
}

export type VersionItem = { id: string; createdAt: string; charCount: number; reason: 'autosave' | 'before_restore' | 'conflict' }

export async function listVersions(taskId: string): Promise<{ error: ErrorKey | null; versions: VersionItem[] }> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'signedOut', versions: [] }
  if (!UUID.test(taskId)) return { error: 'documentNotFound', versions: [] }
  const { data, error } = await supabase
    .from('task_document_versions')
    .select('id, created_at, char_count, reason')
    .eq('task_id', taskId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return { error: toErrorKey('listVersions', error), versions: [] }
  return {
    error: null,
    versions: ((data as { id: string; created_at: string; char_count: number; reason: VersionItem['reason'] }[] | null) ?? []).map(
      (v) => ({ id: v.id, createdAt: v.created_at, charCount: v.char_count, reason: v.reason })
    ),
  }
}

async function readVersion(supabase: Supabase, userId: string, taskId: string, versionId: string) {
  if (!UUID.test(taskId) || !UUID.test(versionId)) return null
  const { data } = await supabase
    .from('task_document_versions')
    .select('content')
    .eq('id', versionId)
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .maybeSingle<{ content: JSONContent }>()
  return data?.content ?? null
}

export async function getVersion(
  taskId: string,
  versionId: string
): Promise<{ error: ErrorKey | null; content?: JSONContent }> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'signedOut' }
  const content = await readVersion(supabase, user.id, taskId, versionId)
  return content ? { error: null, content } : { error: 'versionNotFound' }
}

// この版に戻す: the version becomes the document (the current text is kept
// as a version first, 'before_restore'). The version's count is recounted
// like any save, so progress follows the restored text.
export async function restoreVersion(
  taskId: string,
  expectedVersion: number,
  versionId: string
): Promise<SaveResult & { content?: JSONContent }> {
  const { supabase, user } = await signedIn()
  if (!user) return { status: 'rejected', reason: 'signedOut' }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { status: 'rejected', reason: 'documentInvalid' }
  const content = await readVersion(supabase, user.id, taskId, versionId)
  if (!content) return { status: 'rejected', reason: 'documentInvalid' }
  // Versions were checked when they were saved; a restore checks again, in
  // case the schema has narrowed since.
  const checked = checkDocument(content)
  if (!checked.ok) return { status: 'rejected', reason: checked.error }
  const result = await save(supabase, taskId, expectedVersion, checked.content, checked.count, 'before_restore', 'restoreVersion')
  return result.status === 'saved' ? { ...result, content: checked.content } : result
}
