import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { TaskForm } from './task-form'

// 新しいタスク (mockup view "newtask"). Any pod member adds a task and may give
// it to any member, or to nobody yet (0022: any member edits the task list).
export default async function NewTaskPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tCommon] = await Promise.all([getTranslations('project'), getTranslations('common')])

  const { data: myPod } = await supabase
    .from('pairing_members')
    .select('pairing_id, pairings!inner(class_id, status)')
    .eq('user_id', user.id)
    .eq('pairings.class_id', classId)
    .eq('pairings.status', 'active')
    .limit(1)
    .maybeSingle()
  if (!myPod) redirect(`/classes/${classId}/project`)

  const [{ data: project }, { data: memberRows }] = await Promise.all([
    supabase.from('projects').select('id, title').eq('pairing_id', myPod.pairing_id).eq('status', 'active').maybeSingle(),
    supabase
      .from('pairing_members')
      .select('user_id, joined_at, profiles(display_name)')
      .eq('pairing_id', myPod.pairing_id)
      .order('joined_at'),
  ])
  if (!project) redirect(`/classes/${classId}/project`)

  const members = (memberRows ?? []).map((m) => {
    const name = (m.profiles as unknown as { display_name: string } | null)?.display_name ?? tCommon('unknownPerson')
    return { id: m.user_id, name: m.user_id === user.id ? t('you', { name }) : name }
  })
  // Me first, so a task I add for myself is one tap.
  members.sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id))

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <Link
          href={`/classes/${classId}/project`}
          className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text"
        >
          {t('back')}
        </Link>
        <p className="font-meta text-[13px] text-muted [overflow-wrap:anywhere]">{project.title}</p>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{t('newTask.pageTitle')}</h1>
        <TaskForm classId={classId} projectId={project.id} members={members} defaultOwnerId={user.id} />
      </div>
    </div>
  )
}
