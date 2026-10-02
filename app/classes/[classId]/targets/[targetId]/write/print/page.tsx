import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { JSONContent } from '@tiptap/core'
import { createClient } from '@/lib/supabase/server'
import { EMPTY_DOCUMENT } from '@/lib/doc-schema'
import { DocView } from '@/components/doc-view'
import { PrintButton } from './print-button'

type Params = Promise<{ classId: string; targetId: string }>

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('editor.print')
  return { title: t('print') }
}

// The PDF view (Prompt 12): the saved text alone, on A4 (globals.css @page),
// printed with the browser's own dialog. Page numbers come from @page's
// margin boxes (Chrome and Edge). No title is added, as in the .docx. The
// document is rendered from its JSON as React elements (components/doc-view),
// never as HTML.
export default async function PrintPage({ params }: { params: Params }) {
  await connection()
  const { classId, targetId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: target }, { data: doc }, t] = await Promise.all([
    supabase
      .from('targets')
      .select('title, input_mode')
      .eq('id', targetId)
      .eq('class_id', classId)
      .eq('user_id', user.id)
      .maybeSingle<{ title: string; input_mode: string }>(),
    supabase
      .from('documents')
      .select('content')
      .eq('target_id', targetId)
      .eq('user_id', user.id)
      .maybeSingle<{ content: JSONContent }>(),
    getTranslations('editor.print'),
  ])
  if (!target || target.input_mode !== 'document') redirect(`/classes/${classId}`)

  const content = doc?.content?.content?.length ? doc.content : EMPTY_DOCUMENT

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16 print:p-0">
      <div className="flex w-full max-w-3xl flex-col gap-3.5">
        <div className="print-hidden flex flex-col gap-2">
          <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink [overflow-wrap:anywhere]">
            {t('title', { title: target.title })}
          </h1>
          <p className="text-sm leading-7 text-muted">{t('hint')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <PrintButton label={t('print')} />
            <Link
              href={`/classes/${classId}/targets/${targetId}/write`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
            >
              {t('back')}
            </Link>
          </div>
        </div>
        <div className="rule-card px-5 py-3.5 print:bg-transparent print:p-0 print:shadow-none">
          <DocView content={content} className="doc-print" />
        </div>
      </div>
    </div>
  )
}
