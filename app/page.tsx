import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { SETUP_SEEN_COOKIE, buildChecklist, type HomeClass, type StepId } from '@/lib/checklist'
import { HOME_TARGET_LIMIT, sortHomeTargets } from '@/lib/home-targets'
import { formatDateWithWeekday, tokyoWeekStart } from '@/lib/date'
import { weekTotal } from '@/lib/progress-stats'
import { tidyTotal, type AmountType } from '@/lib/quick-log'
import { MarkSetupSeen } from './setup-seen'
import { CodeJoinForm } from '@/components/code-join-form'
import { RuleSnap } from '@/components/rule-snap'
import { QuickLogProvider } from '@/components/quick-log/quick-log-provider'
import { FinishedTargets, StickyLog, TargetCard } from '@/components/quick-log/target-card'
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

const AMOUNT_TYPES: AmountType[] = ['character_count', 'word_count', 'study_hours']
const NUDGE_LIMIT = 3 // per sender → recipient in a rolling 24 hours (0011)

// Home (screen 05, redesigned in Prompt 11): greeting with today's date, the
// 3 steps while setting up, 今週, my targets (most urgent first, finished
// ones folded away), ポッドの様子 and my classes. On a phone the first screen
// shows the greeting, the most urgent target and ＋記録; from 1024px, targets
// on the left and the pod on the right. Everything sits on the notebook rule
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

  const [{ data: profile }, { data: memberships }, pods, quick, { data: sentNudges }, mateTargets] =
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

  const checklist = buildChecklist(classes, quick.rows.length > 0)
  const seenAllDone = (await cookies()).get(SETUP_SEEN_COOKIE)?.value === user.id
  const showChecklist = !checklist.allDone || !seenAllDone

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
  const homeTargets = openTargets.slice(0, HOME_TARGET_LIMIT)
  const moreTargets = openTargets.length - homeTargets.length
  const finishedTargets = sortedTargets.filter((x) => x.finished)

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

          <div className="flex min-w-0 flex-col gap-7">
            {showChecklist &&
              (checklist.allDone ? (
                <section className="rule-card px-3.5 py-3.5">
                  <p role="status" className="text-[15px] leading-7 font-semibold text-ink">
                    {t('setup.allDone')}
                  </p>
                  <MarkSetupSeen userId={user.id} />
                </section>
              ) : (
                <section aria-labelledby="setup-heading" className="rule-card px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id="setup-heading" className="font-heading text-lg leading-7 font-bold text-ink">
                      {t('setup.heading')}
                    </h2>
                    <span className="shrink-0 font-meta text-xs leading-7 text-muted">
                      {t('setup.count', { done: checklist.doneCount, total: 3 })}
                    </span>
                  </div>
                  <div className="flex h-7 items-center">
                    <div
                      role="progressbar"
                      aria-label={t('setup.heading')}
                      aria-valuemin={0}
                      aria-valuemax={3}
                      aria-valuenow={checklist.doneCount}
                      aria-valuetext={t('setup.valueText', { done: checklist.doneCount, total: 3 })}
                      className="h-1.5 w-full overflow-hidden rounded-[2px] bg-border"
                    >
                      <div className="h-full bg-ink" style={{ width: `${(checklist.doneCount / 3) * 100}%` }} />
                    </div>
                  </div>
                  <ol>
                    {checklist.steps.map((step, i) => (
                      <Step
                        key={step.id}
                        id={step.id}
                        number={i + 1}
                        done={step.done}
                        isNext={checklist.next === step.id}
                        isLast={i === checklist.steps.length - 1}
                        href={checklist.next === step.id ? checklist.nextHref : null}
                        joinedClassName={checklist.joinedClassName}
                      />
                    ))}
                  </ol>
                </section>
              ))}

            {quick.rows.length > 0 && <WeekSummary />}

            {sortedTargets.length > 0 && (
              <section aria-labelledby="targets-heading" className="flex flex-col gap-7">
                <div className="-mb-7 flex items-start justify-between gap-3 px-0.5">
                  <h2 id="targets-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
                    {t('targetsHeading')}
                  </h2>
                  {checklist.nextHref === null && classes.some((c) => !c.organizer) && (
                    <Link
                      href={`/classes/${(classes.find((c) => c.podSize !== null && !c.organizer) ?? classes.find((c) => !c.organizer))!.id}/targets/new`}
                      className="-mt-[5px] -mb-[11px] inline-flex min-h-11 items-center text-sm leading-7 font-semibold text-accent-text underline-offset-4 hover:underline"
                    >
                      {t('newTarget')}
                    </Link>
                  )}
                </div>
                {homeTargets.length > 0 && (
                  <ul className="flex flex-col gap-7">
                    {homeTargets.map((target) => (
                      <TargetCard key={target.id} targetId={target.id} showClass />
                    ))}
                  </ul>
                )}
                {moreTargets > 0 && (
                  <p className="flex flex-wrap gap-x-2 px-0.5 text-sm leading-7 text-muted">
                    <span>{t('moreTargets', { count: moreTargets })}</span>
                    <Link href="/classes" className="font-semibold text-accent-text underline underline-offset-4">
                      {t('moreTargetsLink')}
                    </Link>
                  </p>
                )}
                <FinishedTargets targetIds={finishedTargets.map((x) => x.id)} showClass />
              </section>
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
        <StickyLog targetId={openTargets[0]?.id ?? null} />
      </div>
    </QuickLogProvider>
  )
}

async function Step({
  id,
  number,
  done,
  isNext,
  isLast,
  href,
  joinedClassName,
}: {
  id: StepId
  number: number
  done: boolean
  isNext: boolean
  isLast: boolean
  href: string | null
  joinedClassName: string | null
}) {
  const t = await getTranslations('home')
  const detail =
    done && id === 'join' && joinedClassName
      ? t('setup.joinedClass', { name: joinedClassName })
      : t(`setup.steps.${id}.body`)

  return (
    <li
      className={
        isNext
          ? '-mx-3.5 flex gap-3.5 rounded-[2px] bg-page-bg px-3.5 py-3.5 shadow-[inset_0_0_0_1px_var(--accent-text)]'
          : `flex gap-3.5 py-3.5 ${isLast ? '' : 'bg-[repeating-linear-gradient(90deg,#e3d4b0_0_4px,transparent_4px_8px)] bg-[length:100%_1px] bg-bottom bg-no-repeat'}`
      }
    >
      <span
        aria-hidden
        className={`inline-flex size-[30px] shrink-0 items-center justify-center rounded-full font-meta text-[13px] ${
          done
            ? '-rotate-[7deg] border-[1.5px] border-status-active text-status-active'
            : isNext
              ? '-rotate-[7deg] border-[1.5px] border-accent-text text-accent-text'
              : 'border-[1.5px] border-dashed border-[#b9a57c] text-muted'
        }`}
      >
        {done ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        ) : (
          number
        )}
      </span>
      <div className="flex grow flex-col">
        <span className={`text-base leading-7 font-semibold ${done ? 'text-muted' : 'text-ink'}`}>
          {t(`setup.steps.${id}.title`)}
          <span className="sr-only">
            {done ? t('setup.doneMark') : isNext ? t('setup.nextMark') : ''}
          </span>
        </span>
        <span className="text-sm leading-7 text-ink/85">{detail}</span>
        {isNext && id === 'join' && (
          <RuleSnap>
            <div className="pt-2">
              <CodeJoinForm />
            </div>
          </RuleSnap>
        )}
        {href && (
          <Link
            href={href}
            className="btn my-1.5 inline-flex h-11 items-center justify-center self-start rounded-[2px] bg-accent px-[18px] text-sm font-semibold text-white"
          >
            {t(`setup.steps.${id}.action`)}
          </Link>
        )}
      </div>
    </li>
  )
}
