import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sumProgress, computePace, projectionText } from '@/lib/projection'
import { relativeTime, daysSince } from '@/lib/relativeTime'
import { StatusStamp } from '@/components/status-stamp'
import { ProgressBar } from '@/components/progress-bar'
import { TargetForm } from './target-form'
import { LogProgressForm } from './log-progress-form'
import { CommentSection } from './comment-section'
import { NudgeForm } from './nudge-form'

const CHURN_THRESHOLD_DAYS = 7

const RECENT_LOGS_PER_MEMBER = 5

type TargetType = 'task' | 'word_count' | 'study_hours' | 'character_count'

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

function unitLabelFor(type: TargetType): string {
  if (type === 'word_count') return 'words'
  if (type === 'study_hours') return 'hours'
  if (type === 'character_count') return 'characters'
  return ''
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

  const { data: cls } = await supabase
    .from('classes')
    .select('id, name')
    .eq('id', classId)
    .single()

  if (!cls) {
    redirect('/classes')
  }

  const { data: myTargets } = await supabase
    .from('targets')
    .select('id, user_id, title, target_type, target_amount, deadline')
    .eq('user_id', user.id)
    .eq('class_id', classId)
    .order('created_at')

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

  function targetProgressLine(target: Target): string {
    const totalLogged = sumProgress(logsByTarget.get(target.id) ?? [])
    if (target.target_type === 'task') {
      return totalLogged >= 1 ? 'Done' : 'Not marked done yet'
    }
    const unit = unitLabelFor(target.target_type)
    const amountStr = target.target_amount !== null ? ` / ${target.target_amount}` : ''
    return `${totalLogged}${amountStr} ${unit}`
  }

  function targetProjectionLine(target: Target): string | null {
    if (target.target_type === 'task') return null
    const logs = logsByTarget.get(target.id) ?? []
    const totalLogged = sumProgress(logs)
    const pace = computePace(logs, now)
    return projectionText({
      unitLabel: unitLabelFor(target.target_type),
      totalLogged,
      targetAmount: target.target_amount,
      pace,
      deadline: target.deadline,
      now,
    })
  }

  // Ordered so I appear first, then podmates.
  const orderedPodUserIds = [
    ...podUserIds.filter((id) => id === user.id),
    ...podUserIds.filter((id) => id !== user.id),
  ]

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12 sm:items-start sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-2">
        <h1 className="font-heading text-xl font-semibold text-ink">{cls.name}</h1>
        <p className="font-meta text-xs text-muted">Targets &amp; progress</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-ink">New target</h2>
        <TargetForm classId={classId} />
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-ink">Log progress</h2>
        <LogProgressForm
          classId={classId}
          targets={(myTargets ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            target_type: t.target_type,
          }))}
        />
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Your targets</h2>
        {(myTargets ?? []).length === 0 ? (
          <p className="text-sm text-muted">No targets yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(myTargets ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 rounded-[2px] border border-border bg-surface px-4 py-3"
              >
                <span className="text-sm font-medium text-ink">{t.title}</span>
                <span className="font-meta text-xs text-muted">
                  {t.deadline ? `Due ${t.deadline}` : 'No deadline'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col gap-6">
        <h2 className="font-heading text-lg font-semibold text-ink">Pod progress</h2>
        {!myPairingId ? (
          <p className="text-sm text-muted">You&apos;re not in a pod yet.</p>
        ) : (
          orderedPodUserIds.map((memberId) => {
            const targets = targetsByUser.get(memberId) ?? []
            const recentLogs = recentLogsByUser.get(memberId) ?? []
            const lastLogAt = lastLogAtByUser.get(memberId)
            const lastLogDays = lastLogAt ? daysSince(lastLogAt, now) : null
            const isChurned = lastLogDays !== null && lastLogDays >= CHURN_THRESHOLD_DAYS
            const churnLine =
              lastLogDays === null
                ? 'No logs yet'
                : lastLogDays === 0
                  ? 'Last logged today'
                  : `Last logged ${lastLogDays} day${lastLogDays === 1 ? '' : 's'} ago`
            return (
              <div
                key={memberId}
                className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusStamp status={isChurned ? 'stale' : 'active'} />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-heading text-sm font-semibold text-ink">
                        {profileNames.get(memberId) ?? 'Unknown'}
                        {memberId === user.id ? ' (you)' : ''}
                      </span>
                      <span className="font-meta text-xs text-muted">{churnLine}</span>
                    </div>
                  </div>
                  {memberId !== user.id && (
                    <NudgeForm podId={myPairingId!} toUserId={memberId} />
                  )}
                </div>

                {targets.length === 0 ? (
                  <p className="text-xs text-muted">No targets yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {targets.map((t) => {
                      const projection = targetProjectionLine(t)
                      const totalLogged = sumProgress(logsByTarget.get(t.id) ?? [])
                      return (
                        <li key={t.id} className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-ink">{t.title}</span>
                          <span className="text-xs text-muted">{targetProgressLine(t)}</span>
                          {t.target_type !== 'task' && t.target_amount !== null && (
                            <ProgressBar
                              value={totalLogged}
                              max={t.target_amount}
                              valueText={targetProgressLine(t)}
                            />
                          )}
                          {projection && (
                            <span className="text-xs text-muted">{projection}</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {recentLogs.length > 0 && (
                  <div className="flex flex-col gap-3 border-t border-dashed border-border pt-3">
                    <span className="text-xs font-medium text-muted">Recent activity</span>
                    {recentLogs.map((log) => (
                      <div key={log.id} className="flex flex-col gap-1.5">
                        <div className="flex flex-col">
                          <span className="text-xs text-ink">
                            {log.target.title}: {log.progress_value}
                            {unitLabelFor(log.target.target_type)
                              ? ` ${unitLabelFor(log.target.target_type)}`
                              : ''}
                          </span>
                          {log.description && (
                            <span className="text-xs text-muted">{log.description}</span>
                          )}
                          <span className="font-meta text-[10px] text-muted">
                            {new Date(log.logged_at).toLocaleString()}
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
                            authorName: c.profiles?.display_name ?? 'Unknown',
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

      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Nudges</h2>
        {!myPairingId ? (
          <p className="text-sm text-muted">You&apos;re not in a pod yet.</p>
        ) : (nudges ?? []).length === 0 ? (
          <p className="text-sm text-muted">No nudges yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(nudges as NudgeRow[]).map((n) => (
              <li
                key={n.id}
                className="flex flex-col gap-1 rounded-[2px] border border-border bg-surface px-4 py-3"
              >
                <span className="text-xs text-ink">
                  <span className="font-medium text-accent-text">
                    {profileNames.get(n.from_user_id) ?? 'Unknown'}
                  </span>{' '}
                  &rarr;{' '}
                  <span className="font-medium">
                    {profileNames.get(n.to_user_id) ?? 'Unknown'}
                  </span>
                  : {n.content}
                </span>
                <span className="font-meta text-[10px] text-muted">
                  {relativeTime(n.created_at, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
