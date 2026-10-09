import type { Metadata } from 'next'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { JSONContent } from '@tiptap/core'
import { createClient } from '@/lib/supabase/server'
import { EMPTY_DOCUMENT } from '@/lib/doc-schema'
import { Editor } from './editor'

type Params = Promise<{ classId: string; targetId: string }>

type TargetRow = {
  id: string
  class_id: string
  title: string
  target_amount: number | null
  input_mode: 'manual' | 'document'
  classes: { name: string } | null
}

type DocumentRow = { content: JSONContent; version: number; updated_at: string }

async function load(classId: string, targetId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, target: null, doc: null }

  // My own targets only (the user_id filter); RLS would also show a
  // podmate's target, never its document.
  const [{ data: target }, { data: doc }] = await Promise.all([
    supabase
      .from('targets')
      .select('id, class_id, title, target_amount, input_mode, classes(name)')
      .eq('id', targetId)
      .eq('class_id', classId)
      .eq('user_id', user.id)
      .maybeSingle<TargetRow>(),
    supabase
      .from('documents')
      .select('content, version, updated_at')
      .eq('target_id', targetId)
      .eq('user_id', user.id)
      .maybeSingle<DocumentRow>(),
  ])
  return { user, target, doc }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { classId, targetId } = await params
  const [{ target }, t] = await Promise.all([load(classId, targetId), getTranslations('editor')])
  return target ? { title: t('metaTitle', { title: target.title }) } : {}
}

// 「Study Pods で書く」 (Prompt 12): the editor for one of my document
// targets. Read fresh on every request (connection()): the text is never
// cached by Next, and the service worker caches no pages (public/sw.js).
export default async function WritePage({ params }: { params: Params }) {
  await connection()
  const { classId, targetId } = await params
  const { user, target, doc } = await load(classId, targetId)

  if (!user) redirect('/login')
  if (!target || target.input_mode !== 'document') redirect(`/classes/${classId}`)

  // A target with no saved text yet has no row (save_document makes it), and
  // 0019's starting content is an empty doc, which the editor's schema
  // (block+) doesn't allow: both open as one empty paragraph.
  const content = doc?.content?.content?.length ? doc.content : EMPTY_DOCUMENT

  return (
    <Editor
      userId={user.id}
      classId={classId}
      className={target.classes?.name ?? ''}
      targetId={target.id}
      title={target.title}
      targetAmount={target.target_amount === null ? null : Number(target.target_amount)}
      initial={{ content, version: doc?.version ?? 0, updatedAt: doc?.updated_at ?? null }}
    />
  )
}
