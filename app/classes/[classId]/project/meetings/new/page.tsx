import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { loadMyPodProject } from '../../load'
import { PollForm } from './poll-form'

// 打ち合わせの日程 (mockup view "poll"): a title, a length and 2–8 times.
export default async function NewPollPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tCommon] = await Promise.all([getTranslations('project'), getTranslations('common')])
  const pod = await loadMyPodProject(supabase, classId, user.id, tCommon('unknownPerson'))
  if (!pod?.project) redirect(`/classes/${classId}/project`)

  return (
    <div className="flex flex-1 flex-col px-4 pt-7 pb-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 md:max-w-xl">
        <Link
          href={`/classes/${classId}/project/meetings`}
          className="-ml-2 inline-flex min-h-11 items-center self-start rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-container"
        >
          {t('back')}
        </Link>
        <h1 className="font-heading text-[28px] leading-tight font-bold text-ink lg:text-[36px]">{t('poll.pageTitle')}</h1>
        <PollForm classId={classId} projectId={pod.project.id} />
      </div>
    </div>
  )
}
