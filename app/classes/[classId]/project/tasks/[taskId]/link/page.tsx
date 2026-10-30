import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { loadMyPodProject } from '../../../load'
import { LinkForm } from './link-form'

// 「台本」のはかり方 (automation mockup, view "link"): count a task from a heading
// of the group Doc, from my own Doc (characters), from a Slides file (a
// count), or by hand. Any pod member may link (0023); the board offers it on
// my own tasks.
export default async function LinkTaskPage({ params }: { params: Promise<{ classId: string; taskId: string }> }) {
  const { classId, taskId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tCommon, locale] = await Promise.all([getTranslations('google'), getTranslations('common'), getLocale()])
  const pod = await loadMyPodProject(supabase, classId, user.id, tCommon('unknownPerson'))
  if (!pod?.project) redirect(`/classes/${classId}/project`)
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) notFound()

  const { data: task } = await supabase
    .from('project_tasks')
    .select('id, title, metric, input_mode, project_id')
    .eq('id', taskId)
    .eq('project_id', pod.project.id)
    .maybeSingle()
  if (!task) notFound()

  const [{ data: current }, { data: groupSource }, { data: hasGoogle }] = await Promise.all([
    supabase.from('task_sources').select('kind, file_id, heading_id, state').eq('task_id', task.id).maybeSingle(),
    supabase
      .from('task_sources')
      .select('file_id, project_tasks!inner(project_id)')
      .eq('kind', 'doc_section')
      .eq('project_tasks.project_id', pod.project.id)
      .limit(1)
      .maybeSingle(),
    supabase.rpc('has_google_connection'),
  ])

  const backHref = `/classes/${classId}/project`
  const thisPath = `${backHref}/tasks/${task.id}/link`

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <Link href={backHref} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text">
          {t('back')}
        </Link>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink [overflow-wrap:anywhere]">
          {t('linkTitle', { title: task.title })}
        </h1>
        {task.metric === 'status' || task.input_mode !== 'manual' ? (
          <p className="text-sm leading-7 text-muted">{t('linkNotCountable')}</p>
        ) : !hasGoogle ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-7 text-muted">{t('connectWhy')}</p>
            <a href={`/api/google/connect?return=${encodeURIComponent(thisPath)}`} className="btn inline-flex h-[52px] w-full items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
              {t('connect')}
            </a>
            <p className="text-[13px] leading-7 text-muted">{t('connectFine')}</p>
          </div>
        ) : (
          <LinkForm
            classId={classId}
            taskId={task.id}
            title={task.title}
            metric={task.metric}
            groupDocId={(groupSource as { file_id: string } | null)?.file_id ?? null}
            current={current ? { kind: current.kind, fileId: current.file_id, headingId: current.heading_id, state: current.state } : null}
            locale={locale}
          />
        )}
      </div>
    </div>
  )
}
