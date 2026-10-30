import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { homeProjectHref } from '@/lib/home-project'
import { nextStep } from '@/lib/next-step'
import { formatDateWithWeekday } from '@/lib/date'
import { NextStepCard } from '@/components/next-step-card'
import { Landing } from '@/components/landing/landing'

// / is the page crawlers and link previews see (always logged out), so it is
// indexed and carries the landing title and description.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata')
  return {
    title: t('landingTitle'),
    description: t('landingDescription'),
    robots: { index: true, follow: true },
    alternates: { canonical: '/' },
    openGraph: {
      title: t('landingTitle'),
      description: t('landingDescription'),
      url: '/',
    },
  }
}

type MembershipRow = {
  class_id: string
  joined_at: string
  role: 'student' | 'organizer'
  classes: { id: string; name: string; term: string } | null
}

// Home (project first, 2026-10-30). A student whose team has a project never
// sees it: they land on the project's board. Everyone else gets the greeting,
// the one next step (lib/next-step.ts: join a class, answer an invitation,
// start or join a team, start the project) and their classes. On the notebook
// rule (--rule, 28px): text in 28px lines, cards whole lines tall, gaps of one
// line. No email here (it lives only in 設定), and no ログアウト.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Logged out: the public landing page (after deleting an account, with
  // 「アカウントを削除しました」 on top). Logged in: Home.
  if (!user) {
    const { deleted } = await searchParams
    return <Landing accountDeleted={deleted === '1'} />
  }

  // Project first: a student whose team has a project lands on its board.
  // RLS returns only the projects of pods I am in.
  const { data: projectRows } = await supabase
    .from('projects')
    .select('deadline, created_at, pairings!inner(class_id, status)')
    .eq('pairings.status', 'active')
    .eq('status', 'active')
  const projectHref = homeProjectHref(
    ((projectRows ?? []) as unknown as { deadline: string | null; created_at: string; pairings: { class_id: string } }[]).map(
      (r) => ({ classId: r.pairings.class_id, deadline: r.deadline, createdAt: r.created_at })
    )
  )
  if (projectHref) redirect(projectHref)

  const now = new Date()
  const [{ data: profile }, { data: memberships }, { data: pods }, { data: invites }, t, locale] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase
      .from('class_memberships')
      .select('class_id, joined_at, role, classes(id, name, term)')
      .eq('user_id', user.id)
      .order('joined_at'),
    // My teams and how many are in each (RLS: pods in my classes).
    supabase
      .from('pairing_members')
      .select('pairing_id, pairings!inner(class_id, status, pairing_members(user_id))')
      .eq('user_id', user.id)
      .eq('pairings.status', 'active'),
    supabase
      .from('pod_invitations')
      .select('class_id')
      .eq('invitee_id', user.id)
      .eq('kind', 'invite')
      .eq('status', 'pending'),
    getTranslations('home'),
    getLocale() as Promise<Locale>,
  ])

  const teamSize = new Map(
    ((pods ?? []) as unknown as { pairings: { class_id: string; pairing_members: unknown[] } }[]).map((p) => [
      p.pairings.class_id,
      p.pairings.pairing_members.length,
    ])
  )
  const invitedTo = new Set((invites ?? []).map((i) => i.class_id))
  const classes = ((memberships as MembershipRow[] | null) ?? [])
    .filter((m) => m.classes)
    .map((m) => ({
      id: m.class_id,
      name: m.classes!.name,
      term: m.classes!.term,
      organizer: m.role === 'organizer',
      podSize: teamSize.get(m.class_id) ?? null,
      invited: invitedTo.has(m.class_id),
      // Any project would have sent me to its board above.
      project: 'none' as const,
    }))
  const step = nextStep({ classes })

  return (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16 lg:px-16 lg:pb-14">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="flex items-start justify-between gap-3 px-0.5">
          <h1 className="font-heading text-[22px] leading-7 font-bold text-ink lg:text-[26px]">
            {profile?.display_name ? t('greeting', { name: profile.display_name }) : t('greetingNoName')}
          </h1>
          <time dateTime={now.toISOString()} className="relative top-1 shrink-0 font-meta text-[13px] leading-7 text-muted">
            {formatDateWithWeekday(now, locale)}
          </time>
        </div>

        <NextStepCard step={step} />

        {classes.length > 0 && (
          <section aria-labelledby="classes-heading" className="flex flex-col">
            <h2 id="classes-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
              {t('classesHeading')}
            </h2>
            {/* Rows of links one line apart, so their 44px tap areas never
                overlap. Their negative margins (-5 / -11px) keep each to
                one 28px line and drop the text onto the ruled line. */}
            <ul className="flex flex-wrap gap-x-4 gap-y-7 px-0.5">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/classes/${c.id}`}
                    className="-mt-[5px] -mb-[11px] inline-flex min-h-11 items-center gap-1.5 text-sm leading-7 font-semibold text-accent-text underline-offset-4 hover:underline"
                  >
                    {c.name}
                    {c.organizer && <span className="font-meta text-xs font-normal text-muted">{t('organizerMark')}</span>}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/classes"
                  className="-mt-[5px] -mb-[11px] inline-flex min-h-11 items-center text-sm leading-7 font-semibold text-accent-text underline underline-offset-4"
                >
                  {t('joinAnotherClass')}
                </Link>
              </li>
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
