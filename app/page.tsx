import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { loggedOnTokyoDay, nextStep } from '@/lib/next-step'
import { homeLayout } from '@/lib/home-layout'
import { HOME_TARGET_LIMIT, sortHomeTargets } from '@/lib/home-targets'
import { formatDateWithWeekday, tokyoWeekStart } from '@/lib/date'
import { weekTotal } from '@/lib/progress-stats'
import { tidyTotal, type AmountType } from '@/lib/quick-log'
import { NextStepCard } from '@/components/next-step-card'
import { secondaryButtonClass } from '@/components/buttons'
import { QuickLogProvider } from '@/components/quick-log/quick-log-provider'
import { FinishedTargets, TargetCard } from '@/components/quick-log/target-card'
import { RecentLogs } from '@/components/quick-log/recent-logs'
import { WeekSummary } from '@/components/quick-log/week-summary'
import { loadMyTargets } from '@/components/quick-log/load'
import { PodGlance, type GlancePod } from '@/components/home/pod-glance'
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

type PodRow = {
  pairing_id: string
  pairings: {
    class_id: string
    pairing_members: { user_id: string; joined_at: string; profiles: { display_name: string } | null }[]
  } | null
}

type MateTargetRow = {
  user_id: string
  class_id: string
  target_type: string
  week: { progress_value: number; logged_at: string }[]
  last: { logged_at: string }[]
}

type HomeClass = {
  id: string
  name: string
  term: string
  podSize: number | null
  organizer: boolean
}

const AMOUNT_TYPES: AmountType[] = ['character_count', 'word_count', 'study_hours']
const NUDGE_LIMIT = 3 // per sender → recipient in a rolling 24 hours (0011)

// Home (screen 05, redesigned in Prompt 11, simplified in Prompt 15 PR 2):
// greeting with today's date; 次にやること (Prompt 11b, lib/next-step.ts) at
// the top when it is something to do before logging, or under the hero when
// it is only a pod prompt (lib/home-layout.ts decides, and keeps Home to at
// most one filled button); the hero target card (the first open target, with
// the one big button); 今週; the other targets (finished ones folded away);
// 最近の記録, collapsed; ポッドの様子 and my classes. There is no sticky ＋記録
// any more. On a phone the first screen shows the greeting and the hero; from
// 1024px, targets on the left and the pod on the right. Everything sits on the notebook rule
// (--rule, 28px): text on the page is in 28px lines just above a ruled line,
// cards are whole lines tall, and every gap is one line. No email here (it lives only in
// 設定), and no ログアウト (設定 on phones, the header on desktop).
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

  const now = new Date()
  const weekStart = tokyoWeekStart(now).toISOString()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Two waves of reads. First, in parallel: my profile, classes, pods (with
  // their members and names), targets and the nudges I sent in the last 24
  // hours. Then my logs, and my podmates' targets with only this week's logs
  // and each target's latest one (two filtered embeds of progress_logs).
  // RLS limits every read to what I may see; the filters say what Home wants.
  // Promise.resolve: a query builder runs again each time it is awaited;
  // this runs it once and shares the result.
  const podsRead = Promise.resolve(
    supabase
      .from('pairing_members')
      .select(
        'pairing_id, pairings!inner(class_id, status, pairing_members(user_id, joined_at, profiles(display_name)))'
      )
      .eq('user_id', user.id)
      .eq('pairings.status', 'active')
  ).then(({ data }) => ((data as PodRow[] | null) ?? []).filter((p) => p.pairings))

  const matesRead = podsRead.then(async (pods) => {
    const mateIds = [
      ...new Set(pods.flatMap((p) => p.pairings!.pairing_members.map((m) => m.user_id)).filter((id) => id !== user.id)),
    ]
    if (mateIds.length === 0) return [] as MateTargetRow[]
    const { data } = await supabase
      .from('targets')
      .select(
        'user_id, class_id, target_type, week:progress_logs(progress_value, logged_at), last:progress_logs(logged_at)'
      )
      .in('user_id', mateIds)
      .in(
        'class_id',
        pods.map((p) => p.pairings!.class_id)
      )
      .gte('week.logged_at', weekStart)
      .order('logged_at', { referencedTable: 'last', ascending: false })
      .limit(1, { referencedTable: 'last' })
    return (data as MateTargetRow[] | null) ?? []
  })

  const [{ data: profile }, { data: memberships }, pods, quick, { data: sentNudges }, mateTargets, { data: invites }] =
    await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase
        .from('class_memberships')
        .select('class_id, joined_at, role, classes(id, name, term)')
        .eq('user_id', user.id)
        .order('joined_at'),
      podsRead,
      // あなたの目標: my targets and all my logs on them (totals are summed).
      loadMyTargets(supabase, user.id, {
        podClasses: podsRead.then((p) => new Set(p.map((x) => x.pairings!.class_id))),
      }),
      supabase.from('nudges').select('to_user_id').eq('from_user_id', user.id).gte('created_at', dayAgo),
      matesRead,
      // 次にやること: a pending invitation to a pod (for 招待を見る).
      supabase
        .from('pod_invitations')
        .select('class_id')
        .eq('invitee_id', user.id)
        .eq('kind', 'invite')
        .eq('status', 'pending'),
    ])

  const podByClass = new Map(pods.map((p) => [p.pairings!.class_id, p.pairings!.pairing_members]))

  const classes: HomeClass[] = ((memberships as MembershipRow[] | null) ?? [])
    .filter((m) => m.classes)
    .map((m) => ({
      id: m.class_id,
      name: m.classes!.name,
      term: m.classes!.term,
      podSize: podByClass.get(m.class_id)?.length ?? null,
      organizer: m.role === 'organizer',
    }))


  const [t, tCommon, locale] = await Promise.all([
    getTranslations('home'),
    getTranslations('common'),
    getLocale() as Promise<Locale>,
  ])

  // Unfinished first, nearest deadline first; a handful on Home (the rest
  // one tap away on the class pages), finished ones folded at the bottom.
  const totals = new Map<string, number>()
  for (const log of quick.logs) totals.set(log.targetId, (totals.get(log.targetId) ?? 0) + log.value)
  const sortedTargets = sortHomeTargets(
    quick.rows.map((r) => {
      const total = tidyTotal(totals.get(r.id) ?? 0)
      const finished =
        r.target_type === 'task'
          ? total >= 1
          : r.target_amount !== null && total >= Number(r.target_amount)
      return { ...r, finished, createdAt: r.created_at }
    })
  )
  const openTargets = sortedTargets.filter((x) => !x.finished)
  const finishedTargets = sortedTargets.filter((x) => x.finished)

  const invitedTo = new Set((invites ?? []).map((i) => i.class_id))
  const loggedToday = loggedOnTokyoDay(
    quick.logs.map((l) => l.loggedAt),
    now
  )
  const step = nextStep({
    classes: classes.map((c) => ({ ...c, invited: invitedTo.has(c.id) })),
    targets: sortedTargets.map((x) => ({
      id: x.id,
      classId: x.class_id,
      title: x.title,
      type: x.target_type,
      targetAmount: x.target_amount === null ? null : Number(x.target_amount),
      deadline: x.deadline,
      createdAt: x.created_at,
      total: tidyTotal(totals.get(x.id) ?? 0),
      inputMode: x.input_mode,
    })),
    loggedToday,
    now,
  })
  const layout = homeLayout(step, openTargets.length > 0, loggedToday)
  // The hero is the first open target; the other open ones follow as cards
  // with an outlined button (the hero is one of HOME_TARGET_LIMIT).
  const heroTarget = layout.hero ? openTargets[0] : null
  const otherOpen = heroTarget ? openTargets.slice(1) : openTargets
  const listedTargets = otherOpen.slice(0, heroTarget ? HOME_TARGET_LIMIT - 1 : HOME_TARGET_LIMIT)
  const hiddenTargets = otherOpen.length - listedTargets.length
  // 新しい目標 goes to a class I study in, preferring one with a pod.
  const newTargetClass =
    classes.find((c) => c.podSize !== null && !c.organizer) ?? classes.find((c) => !c.organizer)

  // ポッドの様子: podmates in the order they joined (never by amount).
  const nudgesTo = new Map<string, number>()
  for (const n of sentNudges ?? []) nudgesTo.set(n.to_user_id, (nudgesTo.get(n.to_user_id) ?? 0) + 1)
  const className = new Map(classes.map((c) => [c.id, c.name]))
  const glance: GlancePod[] = pods.map((p) => {
    const classId = p.pairings!.class_id
    const mates = [...p.pairings!.pairing_members]
      .filter((m) => m.user_id !== user.id)
      .sort((a, b) => (a.joined_at < b.joined_at ? -1 : 1))
      .map((m) => {
        const theirs = mateTargets.filter((x) => x.user_id === m.user_id && x.class_id === classId)
        const lastLoggedAt =
          theirs
            .flatMap((x) => x.last.map((l) => l.logged_at))
            .sort()
            .at(-1) ?? null
        const week = AMOUNT_TYPES.flatMap((type) => {
          const amount = weekTotal(
            theirs
              .filter((x) => x.target_type === type)
              .flatMap((x) => x.week.map((l) => ({ value: Number(l.progress_value), loggedAt: l.logged_at }))),
            now
          )
          return amount > 0 ? [{ type, amount }] : []
        })
        return {
          id: m.user_id,
          name: m.profiles?.display_name ?? tCommon('unknownPerson'),
          lastLoggedAt,
          week,
          nudgeLimitReached: (nudgesTo.get(m.user_id) ?? 0) >= NUDGE_LIMIT,
        }
      })
    return { classId, className: className.get(classId) ?? '', mates }
  })

  return (
    <QuickLogProvider targets={quick.targets} logs={quick.logs} now={now.toISOString()}>
      <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16 lg:px-16 lg:pb-14">
        <div className="mx-auto grid w-full max-w-md gap-7 md:max-w-xl lg:max-w-[1120px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8">
          <div className="flex items-start justify-between gap-3 px-0.5 lg:col-span-2">
            <h1 className="font-heading text-[22px] leading-7 font-bold text-ink lg:relative lg:-top-0.5 lg:text-[26px]">
              {profile?.display_name ? t('greeting', { name: profile.display_name }) : t('greetingNoName')}
            </h1>
            <time dateTime={now.toISOString()} className="relative top-1 shrink-0 font-meta text-[13px] leading-7 text-muted">
              {formatDateWithWeekday(now, locale)}
            </time>
          </div>

          {/* Something to do before logging (join, an invitation, a first
              target, a next target): the card, on top. */}
          {layout.stepSlot === 'top' && (
            <div className="min-w-0 lg:col-span-2">
              <NextStepCard step={step} />
            </div>
          )}

          {/* Hidden while empty (no targets yet), so it adds no gap on phones. */}
          <div className="flex min-w-0 flex-col gap-7 empty:hidden">
            {/* The hero: the first open target and the one big button. */}
            {layout.hero && heroTarget && (
              <ul className="flex flex-col gap-7">
                <TargetCard targetId={heroTarget.id} showClass hero={layout.hero} />
              </ul>
            )}

            {/* A pod prompt never takes the hero's place: it sits under it. */}
            {layout.stepSlot === 'under' && <NextStepCard step={step} podPrimary={layout.stepPrimary} />}

            {quick.rows.length > 0 && <WeekSummary />}

            {sortedTargets.length > 0 && (
              <section aria-labelledby="targets-heading" className="flex flex-col gap-7">
                <div className="-mb-7 flex items-start justify-between gap-3 px-0.5">
                  <div className="min-w-0">
                    <h2 id="targets-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
                      {t('targetsHeading')}
                    </h2>
                    <p className="text-[13px] leading-7 text-muted">{t('targetsWhy')}</p>
                  </div>
                  {newTargetClass && (
                    <Link href={`/classes/${newTargetClass.id}/targets/new`} className={`${secondaryButtonClass} mt-1.5`}>
                      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M8 3v10M3 8h10" />
                      </svg>
                      {t('newTarget')}
                    </Link>
                  )}
                </div>
                {listedTargets.length > 0 && (
                  <ul className="flex flex-col gap-7">
                    {listedTargets.map((target) => (
                      <TargetCard key={target.id} targetId={target.id} showClass logTone="outline" />
                    ))}
                  </ul>
                )}
                {hiddenTargets > 0 && (
                  <p className="flex flex-wrap gap-x-2 px-0.5 text-sm leading-7 text-muted">
                    <span>{t('moreTargets', { count: hiddenTargets })}</span>
                    <Link href="/classes" className="font-semibold text-accent-text underline underline-offset-4">
                      {t('moreTargetsLink')}
                    </Link>
                  </p>
                )}
                <FinishedTargets targetIds={finishedTargets.map((x) => x.id)} showClass />
              </section>
            )}

            {/* My own logs, to edit or delete: closed until asked for. */}
            {quick.rows.length > 0 && (
              <details className="rule-card group px-3.5">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-accent-text [&::-webkit-details-marker]:hidden">
                  {t('recentLogs')}
                  <svg
                    aria-hidden
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 group-open:rotate-180"
                  >
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </summary>
                <div className="pb-7">
                  <RecentLogs />
                </div>
              </details>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-7">
            {classes.some((c) => !c.organizer) && <PodGlance pods={glance} now={now} />}

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
                        {c.organizer && (
                          <span className="font-meta text-xs font-normal text-muted">{t('organizerMark')}</span>
                        )}
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
      </div>
    </QuickLogProvider>
  )
}
