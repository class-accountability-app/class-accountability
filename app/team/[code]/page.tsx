import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { EmptyState, emptyActionClass } from '@/components/empty-state'
import { TeamJoinForm } from './team-join-form'

type PodByCode = {
  pod_id: string
  class_id: string
  class_name: string
  member_count: number
  is_member: boolean
  in_class: boolean
}

const TEAM_CAP = 6

// /team/{code}, from a teammate's QR or code (0028). Logged out, the proxy
// sends the student to /login?next=/team/{code} (and /welcome first without a
// name); both come back here. pod_by_join_code shows the class and how many
// are in the team, never names. Already in it: straight to the project.
export default async function TeamJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/team/${code}`)}`)

  const [{ data: team }, t] = await Promise.all([
    supabase.rpc('pod_by_join_code', { code }).maybeSingle<PodByCode>(),
    getTranslations('teamJoin'),
  ])

  if (!team) {
    return (
      <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
        <div className="flex w-full max-w-md flex-col gap-5">
          <p className="font-meta text-[13px] text-muted">{t('eyebrow')}</p>
          <EmptyState
            illustration="notFound"
            title={t('invalidTitle')}
            headingLevel="h1"
            body={t('invalidBody')}
            action={
              <Link href="/" className={emptyActionClass}>
                {t('home')}
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  if (team.is_member) redirect(`/classes/${team.class_id}/project`)

  const full = Number(team.member_count) >= TEAM_CAP
  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="mt-7 flex w-full max-w-md flex-col gap-3.5 rule-card px-[22px] py-7">
        <p className="font-meta text-[13px] text-muted">{t('eyebrow')}</p>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">
          {t('title', { className: team.class_name })}
        </h1>
        <p className="-mt-1.5 font-meta text-[13px] text-muted">{t('meta', { count: Number(team.member_count) })}</p>
        <p className="text-[15px] leading-7 text-ink/85">{full ? t('full') : t('body')}</p>
        {!team.in_class && !full && <p className="text-[13px] leading-7 text-muted">{t('alsoJoinsClass')}</p>}
        {full ? (
          <Link href="/" className={emptyActionClass}>
            {t('home')}
          </Link>
        ) : (
          <TeamJoinForm code={code} />
        )}
      </div>
    </div>
  )
}
