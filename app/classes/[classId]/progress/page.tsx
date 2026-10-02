import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { sumProgress, computePace, project } from '@/lib/projection'
import { formatDate, formatDateTime, formatDayAgo, tokyoDaysAgo, tokyoWeekStart } from '@/lib/date'
import { tidyTotal } from '@/lib/quick-log'
import { StatusStamp } from '@/components/status-stamp'
import { ProgressBar } from '@/components/progress-bar'
import { QuickLogProvider } from '@/components/quick-log/quick-log-provider'
import { FinishedTargets, MyStamp, StickyLog, TargetCard, TargetProgress } from '@/components/quick-log/target-card'
import { RecentLogs } from '@/components/quick-log/recent-logs'
import { loadMyTargets } from '@/components/quick-log/load'
import { CommentSection } from './comment-section'
import { NudgeForm } from './nudge-form'
import { NudgeList, NudgeListProvider } from './nudge-list'
import { EmptyState, emptyActionClass } from '@/components/empty-state'
import { secondaryButtonClass } from '@/components/buttons'

const CHURN_THRESHOLD_DAYS = 7

const RECENT_LOGS_PER_MEMBER = 5

type TargetType = 'task' | 'word_count' | 'study_hours' | 'character_count'
type NumericTargetType = Exclude<TargetType, 'task'>

type Target = {
  id: string
  user_id: string
  title: string
  target_type: TargetType
  target_amount: number | null
  deadline: string | null
}

type ProgressLog = {
  id: string
  user_id: string
  target_id: string
  progress_value: number
  description: string | null
  logged_at: string
}

type CommentRow = {
  id: string
  progress_log_id: string
  author_id: string
  body: string
  created_at: string
  profiles: { display_name: string } | null
}

type NudgeRow = {
  id: string
  from_user_id: string
  to_user_id: string
  content: string | null
  created_at: string
}

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: cls }, { data: membership }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('id', classId).single(),
    supabase
      .from('class_memberships')
      .select('role')
      .eq('class_id', classId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!cls) {
    redirect('/classes')
  }
  // The organizer (0015) has no progress page: the class page is theirs.
  if (membership?.role === 'organizer') {
    redirect(`/classes/${classId}`)
  }

  // My targets here, with all my logs on them: the quick log's cards, totals
  // and あなたの最近の記録 (screens 10, 11).
  const quick = await loadMyTargets(supabase, user.id, { classId })
  const myTargets = quick.rows

  // Find my pod for this class: active pairings, then the pairing_members
  // rows visible to me (mine + podmates', per RLS) for those pairings.
  const { data: pairings } = await supabase
    .from('pairings')
    .select('id')
    .eq('class_id', classId)
    .eq('status', 'active')

  const pairingIds = pairings?.map((p) => p.id) ?? []

  const { data: members } =
    pairingIds.length > 0
      ? await supabase
          .from('pairing_members')
          .select('pairing_id, user_id')
          .in('pairing_id', pairingIds)
      : { data: [] as { pairing_id: string; user_id: string }[] }

  const membersByPairing = new Map<string, string[]>()
  for (const m of members ?? []) {
    const list = membersByPairing.get(m.pairing_id) ?? []
    list.push(m.user_id)
    membersByPairing.set(m.pairing_id, list)
  }

  const myPairingId = [...membersByPairing.entries()].find(([, userIds]) =>
    userIds.includes(user.id)
  )?.[0]

  const podUserIds = myPairingId ? membersByPairing.get(myPairingId) ?? [] : []

  const [{ data: podProfiles }, { data: podTargets }] = await Promise.all([
    podUserIds.length > 0
      ? supabase.from('profiles').select('id, display_name').in('id', podUserIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    podUserIds.length > 0
      ? supabase
          .from('targets')
          .select('id, user_id, title, target_type, target_amount, deadline')
          .in('user_id', podUserIds)
          .eq('class_id', classId)
          .order('created_at')
      : Promise.resolve({ data: [] as Target[] }),
  ])

  const podTargetIds = (podTargets ?? []).map((t) => t.id)

  const { data: podLogs } =
    podTargetIds.length > 0
      ? await supabase
          .from('progress_logs')
          .select('id, user_id, target_id, progress_value, description, logged_at')
          .in('target_id', podTargetIds)
          .order('logged_at', { ascending: false })
      : { data: [] as ProgressLog[] }

  const logsByTarget = new Map<string, ProgressLog[]>()
  for (const log of (podLogs as ProgressLog[] | null) ?? []) {
    const list = logsByTarget.get(log.target_id) ?? []
    list.push(log)
    logsByTarget.set(log.target_id, list)
  }

  const targetsByUser = new Map<string, Target[]>()
  for (const t of (podTargets as Target[] | null) ?? []) {
    const list = targetsByUser.get(t.user_id) ?? []
    list.push(t)
    targetsByUser.set(t.user_id, list)
  }

  // Most recent N logs per member, across all their targets in this class.
  const recentLogsByUser = new Map<string, (ProgressLog & { target: Target })[]>()
  const targetById = new Map((podTargets ?? []).map((t) => [t.id, t as Target]))
  for (const userId of podUserIds) {
    const theirTargetIds = new Set((targetsByUser.get(userId) ?? []).map((t) => t.id))
    const theirLogs = ((podLogs as ProgressLog[] | null) ?? [])
      .filter((l) => theirTargetIds.has(l.target_id))
      .slice(0, RECENT_LOGS_PER_MEMBER)
      .map((l) => ({ ...l, target: targetById.get(l.target_id)! }))
    recentLogsByUser.set(userId, theirLogs)
  }

  // Churn signal: most recent progress_log per member, across all their
  // targets in this class. podLogs is already ordered newest-first, so the
  // first hit per user is their latest log — no extra query needed.
  const lastLogAtByUser = new Map<string, string>()
  for (const log of (podLogs as ProgressLog[] | null) ?? []) {
    const ownerId = targetById.get(log.target_id)?.user_id
    if (ownerId && !lastLogAtByUser.has(ownerId)) {
      lastLogAtByUser.set(ownerId, log.logged_at)
    }
  }

  const visibleLogIds = [...recentLogsByUser.values()].flat().map((l) => l.id)

  const { data: comments } =
    visibleLogIds.length > 0
      ? await supabase
          .from('progress_comments')
          .select('id, progress_log_id, author_id, body, created_at, profiles(display_name)')
          .in('progress_log_id', visibleLogIds)
          .order('created_at')
      : { data: [] as CommentRow[] }

  const commentsByLog = new Map<string, CommentRow[]>()
  for (const c of (comments as CommentRow[] | null) ?? []) {
    const list = commentsByLog.get(c.progress_log_id) ?? []
    list.push(c)
    commentsByLog.set(c.progress_log_id, list)
  }

  const profileNames = new Map(
    (podProfiles ?? []).map((p) => [p.id, p.display_name])
  )

  // Flat, newest-first: nudges I sent or received in this pod. The pairing_id
  // filter scopes to the current pod; the from/to filter states explicitly
  // what the app wants, with RLS's "read own nudges" policy as the enforcer.
  const { data: nudges } = myPairingId
    ? await supabase
        .from('nudges')
        .select('id, from_user_id, to_user_id, content, created_at')
        .eq('pairing_id', myPairingId)
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
    : { data: [] as NudgeRow[] }

  const now = new Date()
  const [t, tUnits, tAmounts, tCommon, tNudges, tEmpty, locale] = await Promise.all([
    getTranslations('progress'),
    getTranslations('units'),
    getTranslations('amounts'),
    getTranslations('common'),
    getTranslations('nudges'),
    getTranslations('empty'),
    getLocale(),
  ])
  const nameOf = (id: string) => profileNames.get(id) ?? tCommon('unknownPerson')

  function amountText(type: NumericTargetType, logged: number, target: number | null): string {
    return target === null ? tUnits(type, { count: logged }) : tAmounts(type, { logged, target })
  }

  function targetProgressLine(target: Target): string {
    const totalLogged = sumProgress(logsByTarget.get(target.id) ?? [])
    if (target.target_type === 'task') {
      return totalLogged >= 1 ? t('done') : t('notDone')
    }
    return amountText(target.target_type, totalLogged, target.target_amount)
  }

  function targetProjectionLine(target: Target): string | null {
    if (target.target_type === 'task') return null
    const logs = logsByTarget.get(target.id) ?? []
    const projection = project({
      totalLogged: sumProgress(logs),
      targetAmount: target.target_amount,
      pace: computePace(logs, now),
      deadline: target.deadline,
      now,
    })
    if (!projection) return null
    if (projection.kind === 'reached') return t('targetReached')
    if (projection.kind === 'noRecentProgress') return t('noRecentProgress')
    const values = {
      pace: tUnits(target.target_type, { count: projection.pace }),
      finish: formatDate(projection.finish, locale),
    }
    return projection.deadline
      ? t('projectionWithDeadline', { ...values, deadline: formatDate(projection.deadline, locale) })
      : t('projection', values)
  }

  function logAmount(log: ProgressLog & { target: Target }): string {
    return log.target.target_type === 'task'
      ? t('done')
      : tUnits(log.target.target_type, { count: log.progress_value })
  }

  // Ordered so I appear first, then podmates.
  const orderedPodUserIds = [
    ...podUserIds.filter((id) => id === user.id),
    ...podUserIds.filter((id) => id !== user.id),
  ]

  // Unfinished first (in the order they were made), finished ones folded at
  // the bottom; the sticky ＋記録 is for the first unfinished one.
  const myTotal = (id: string) =>
    tidyTotal(quick.logs.filter((l) => l.targetId === id).reduce((sum, l) => sum + l.value, 0))
  const isDone = (target: (typeof myTargets)[number]) =>
    target.target_type === 'task'
      ? myTotal(target.id) >= 1
      : target.target_amount !== null && myTotal(target.id) >= Number(target.target_amount)
  const openTargets = myTargets.filter((target) => !isDone(target))
  const finishedTargets = myTargets.filter(isDone)

  // ポッド全体で今週 +○ (Prompt 11): the whole pod's week, one number per
  // unit, never split by person.
  const weekStart = tokyoWeekStart(now).getTime()
  const podWeek = (['character_count', 'word_count', 'study_hours'] as const).flatMap((type) => {
    const amount = tidyTotal(
      ((podLogs as ProgressLog[] | null) ?? [])
        .filter(
          (l) =>
            targetById.get(l.target_id)?.target_type === type && new Date(l.logged_at).getTime() >= weekStart
        )
        .reduce((sum, l) => sum + Number(l.progress_value), 0)
    )
    return amount > 0 ? [tUnits(type, { count: amount })] : []
  })

  return (
    <NudgeListProvider nudges={(nudges as NudgeRow[] | null) ?? []}>
      <QuickLogProvider targets={quick.targets} logs={quick.logs} now={now.toISOString()}>
      <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12 sm:items-start sm:pl-16">
        <div className="flex w-full max-w-md flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold text-ink">{cls.name}</h1>
          <p className="font-meta text-xs text-muted">{t('subtitle')}</p>
        </div>

        <div className="w-full max-w-md">
          {/* Secondary (Prompt 11b): ＋記録 on the cards is this page's primary. */}
          <Link href={`/classes/${classId}/targets/new`} className={secondaryButtonClass}>
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            {t('newTarget')}
          </Link>
        </div>

        <div id="your-targets" className="flex w-full max-w-md scroll-mt-4 flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-ink">{t('yourTargets')}</h2>
          {myTargets.length === 0 ? (
            <EmptyState
              illustration="target"
              body={tEmpty('noTargets')}
              action={
                <Link href={`/classes/${classId}/targets/new`} className={emptyActionClass}>
                  {tEmpty('createTarget')}
                </Link>
              }
            />
          ) : (
            <>
              {openTargets.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                  {openTargets.map((target) => (
                    <TargetCard key={target.id} targetId={target.id} />
                  ))}
                </ul>
              )}
              <FinishedTargets targetIds={finishedTargets.map((target) => target.id)} />
            </>
          )}
        </div>

        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-heading text-lg font-semibold text-ink">{t('podProgress')}</h2>
            {myPairingId && podWeek.length > 0 && (
              <p className="font-meta text-[13px] font-bold text-[#556b40]">
                {t('podWeek', { amount: podWeek.join(tCommon('listSeparator')) })}
              </p>
            )}
          </div>
          {!myPairingId ? (
            <EmptyState
              illustration="pod"
              body={t('notInPod')}
              action={
                <Link href={`/classes/${classId}`} className={emptyActionClass}>
                  {tEmpty('findPod')}
                </Link>
              }
            />
          ) : (
            orderedPodUserIds.map((memberId) => {
              const targets = targetsByUser.get(memberId) ?? []
              const recentLogs = recentLogsByUser.get(memberId) ?? []
              const lastLogAt = lastLogAtByUser.get(memberId)
              const isChurned =
                lastLogAt !== undefined && tokyoDaysAgo(lastLogAt, now) >= CHURN_THRESHOLD_DAYS
              const isMe = memberId === user.id
              // A podmate with no targets: nudging them is the next step, so
              // the nudge button moves from the header into the empty state.
              const podmateHasNoTargets = !isMe && targets.length === 0
              const churnLine = lastLogAt
                ? t('lastLogged', { when: formatDayAgo(lastLogAt, locale, now) })
                : t('noLogsYet')
              return (
                <div
                  key={memberId}
                  id={`member-${memberId}`}
                  className="flex scroll-mt-4 flex-col gap-3 rounded-[2px] border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {isMe ? (
                        <MyStamp status={isChurned ? 'stale' : 'active'} />
                      ) : (
                        <StatusStamp status={isChurned ? 'stale' : 'active'} />
                      )}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-heading text-sm font-semibold text-ink [overflow-wrap:anywhere]">
                          {isMe ? t('you', { name: nameOf(memberId) }) : nameOf(memberId)}
                        </span>
                        <span className="font-meta text-xs text-muted">{churnLine}</span>
                      </div>
                    </div>
                    {!isMe && !podmateHasNoTargets && (
                      <NudgeForm podId={myPairingId!} fromUserId={user.id} toUserId={memberId} />
                    )}
                  </div>

                  {podmateHasNoTargets ? (
                    <EmptyState
                      illustration="target"
                      body={tEmpty('memberNoTargets', { name: nameOf(memberId) })}
                      action={
                        <NudgeForm podId={myPairingId!} fromUserId={user.id} toUserId={memberId} block />
                      }
                    />
                  ) : targets.length === 0 ? (
                    <p className="text-xs text-muted">{t('noTargets')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {targets.map((target) => {
                        const projection = targetProjectionLine(target)
                        const totalLogged = sumProgress(logsByTarget.get(target.id) ?? [])
                        const progressLine = targetProgressLine(target)
                        return (
                          <li key={target.id} className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-ink">{target.title}</span>
                            {isMe ? (
                              // Mine move with the quick log, before the server answers.
                              <TargetProgress targetId={target.id} />
                            ) : (
                              <>
                                <span className="text-xs text-muted">{progressLine}</span>
                                {target.target_type !== 'task' && target.target_amount !== null && (
                                  <ProgressBar
                                    value={totalLogged}
                                    max={target.target_amount}
                                    valueText={progressLine}
                                  />
                                )}
                              </>
                            )}
                            {projection && (
                              <span className="text-xs text-muted">{projection}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {isMe && targets.length > 0 && recentLogs.length === 0 && (
                    <EmptyState
                      illustration="log"
                      body={tEmpty('noLogs')}
                      action={
                        <a href="#your-targets" className={emptyActionClass}>
                          {tEmpty('logProgress')}
                        </a>
                      }
                    />
                  )}

                  {recentLogs.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-dashed border-border pt-3">
                      <span className="text-xs font-medium text-muted">{t('recentActivity')}</span>
                      {recentLogs.map((log) => (
                        <div key={log.id} className="flex flex-col gap-1.5">
                          <div className="flex flex-col">
                            <span className="text-xs text-ink">
                              {t('logLine', { title: log.target.title, amount: logAmount(log) })}
                            </span>
                            {log.description && (
                              <span className="text-xs text-muted">{log.description}</span>
                            )}
                            <span className="font-meta text-[10px] text-muted">
                              {formatDateTime(log.logged_at, locale, now)}
                            </span>
                          </div>
                          <CommentSection
                            classId={classId}
                            progressLogId={log.id}
                            currentUserId={user.id}
                            comments={(commentsByLog.get(log.id) ?? []).map((c) => ({
                              id: c.id,
                              author_id: c.author_id,
                              body: c.body,
                              created_at: c.created_at,
                              authorName: c.profiles?.display_name ?? tCommon('unknownPerson'),
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {myTargets.length > 0 && <RecentLogs />}

        <div className="flex w-full max-w-md flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-ink">{tNudges('heading')}</h2>
          {!myPairingId ? (
            <p className="text-sm text-muted">{t('notInPod')}</p>
          ) : (
            <NudgeList
              names={Object.fromEntries(profileNames)}
              unknownName={tCommon('unknownPerson')}
            />
          )}
        </div>
        <StickyLog targetId={openTargets[0]?.id ?? null} />
      </div>
      </QuickLogProvider>
    </NudgeListProvider>
  )
}
