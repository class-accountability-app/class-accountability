import type { Metadata } from 'next'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { JSONContent } from '@tiptap/core'
import { createClient } from '@/lib/supabase/server'
import { EMPTY_DOCUMENT } from '@/lib/doc-schema'
import { Editor } from './editor'

type Params = Promise<{ classId: string; taskId: string }>

type TaskRow = {
  id: string
  title: string
  target_amount: number | null
  input_mode: 'manual' | 'document'
  projects: { pairings: { class_id: string; classes: { name: string } | null } | null } | null
}

type DocumentRow = { content: JSONContent; version: number; updated_at: string }

async function load(classId: string, taskId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, task: null, doc: null }

  // My own tasks only (the owner filter); teammates can read the task row,
  // never its document. The document is the writer's (RLS: own rows only).
  const [{ data: task }, { data: doc }] = await Promise.all([
    supabase
      .from('project_tasks')
      .select('id, title, target_amount, input_mode, projects!inner(pairings!inner(class_id, classes(name)))')
      .eq('id', taskId)
      .eq('owner_id', user.id)
      .eq('projects.pairings.class_id', classId)
      .maybeSingle<TaskRow>(),
    supabase
      .from('task_documents')
      .select('content, version, updated_at')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle<DocumentRow>(),
  ])
  return { user, task, doc }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { classId, taskId } = await params
  const [{ task }, t] = await Promise.all([load(classId, taskId), getTranslations('editor')])
  return task ? { title: t('metaTitle', { title: task.title }) } : {}
}

// 「Study Pods で書く」 (Prompt 12): the editor for one of my document tasks
// (0030). Read fresh on every request (connection()): the text is never
// cached by Next, and the service worker caches no pages (public/sw.js).
export default async function WritePage({ params }: { params: Params }) {
  await connection()
  const { classId, taskId } = await params
  const { user, task, doc } = await load(classId, taskId)

  if (!user) redirect('/login')
  if (!task || task.input_mode !== 'document') redirect(`/classes/${classId}/project`)

  // A task with no saved text yet has no row (save_task_document makes it),
  // and the starting content is an empty doc, which the editor's schema
  // (block+) doesn't allow: both open as one empty paragraph.
  const content = doc?.content?.content?.length ? doc.content : EMPTY_DOCUMENT

  return (
    <Editor
      userId={user.id}
      classId={classId}
      className={task.projects?.pairings?.classes?.name ?? ''}
      taskId={task.id}
      title={task.title}
      targetAmount={task.target_amount === null ? null : Number(task.target_amount)}
      initial={{ content, version: doc?.version ?? 0, updatedAt: doc?.updated_at ?? null }}
    />
  )
}
