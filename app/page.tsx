import type { Metadata } from 'next'
import Link from 'next/link'
import { secondaryButtonClass } from '@/components/buttons'
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

  // Soft pastel (2026-11-06): the date as a small line above a big
  // greeting, the next step on Penna, then my classes as cards.
  return (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl lg:max-w-4xl">
        <div className="px-0.5">
          <time dateTime={now.toISOString()} className="font-meta text-[13px] leading-7 text-muted">
            {formatDateWithWeekday(now, locale)}
          </time>
          <h1 className="font-heading text-[28px] leading-tight font-bold text-ink [overflow-wrap:anywhere] lg:text-[36px]">
            {profile?.display_name ? t('greeting', { name: profile.display_name }) : t('greetingNoName')}
          </h1>
        </div>

        <NextStepCard step={step} />

        {classes.length > 0 && (
          <section aria-labelledby="classes-heading" className="flex flex-col gap-3.5">
            <h2 id="classes-heading" className="px-0.5 font-heading text-lg leading-7 font-bold text-ink">
              {t('classesHeading')}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/classes/${c.id}`}
                    className="rule-card flex min-h-[88px] items-center justify-between gap-4 px-5 py-4 hover:bg-surface-container"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-base leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{c.name}</span>
                      <span className="font-meta text-[13px] leading-6 text-muted">
                        {c.term}
                        {c.organizer && ` · ${t('organizerMark')}`}
                      </span>
                    </span>
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-ink">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 17L17 7M9 7h8v8" />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="px-0.5">
              <Link href="/classes" className={secondaryButtonClass}>
                {t('joinAnotherClass')}
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
