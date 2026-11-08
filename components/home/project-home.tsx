import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateWithWeekday, formatTimeAgo, tokyoDaysUntil } from '@/lib/date'
import { isOverdue, projectPercent } from '@/lib/project-stats'
import { latestCheckins, visibleTotal, type CheckinRow } from '@/lib/project-board'
import { checkinStatus } from '@/lib/checkin'
import { ProgressBar } from '@/components/progress-bar'
import { ClassAnnouncements } from '@/components/class-announcements'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { STATUS_PILL_CLASS, loadLiveTotals, loadMyPodProject, taskValueText, type TaskRow } from '@/app/classes/[classId]/project/load'
import { chosenStart, formatMeeting, isUpcoming, loadPolls } from '@/app/classes/[classId]/project/meetings/load'
import { WriteInAppButton } from '@/app/classes/[classId]/project/task-controls'
import { OpenSourceButton } from '@/components/project/open-source-button'
import type { SourceKind } from '@/lib/google-links'

type SourceRow = { task_id: string; kind: SourceKind; file_id: string; label: string | null; state: 'ok' | 'lost_access' }

// Home for a student whose team has a project (2026-11-06, replacing the
// redirect to the board): what is mine to do, at a glance, with the board one
// tap away. The same numbers as the board: live totals where the team shares
// them (0027), else check-in numbers for teammates (lib/project-board.ts).
// Logging stays on the board, so there is one place to record progress.
export async function ProjectHome({
  classId,
  className,
  userId,
  locale,
}: {
  classId: string
  className: string
  userId: string
  locale: Locale
}) {
  const supabase = await createClient()
  const [t, tProject, tCommon] = await Promise.all([
    getTranslations('home'),
    getTranslations('project'),
    getTranslations('common'),
  ])
  const pod = await loadMyPodProject(supabase, classId, userId, tCommon('unknownPerson'))
  if (!pod?.project) return null
  const { project, members } = pod

  const [{ data: taskRows }, { data: checkinRows }, polls, { data: nudgeRows }] = await Promise.all([
    supabase
      .from('project_tasks')
      .select('id, title, owner_id, metric, unit, target_amount, status, due, input_mode')
      .eq('project_id', project.id)
      .order('position')
      .order('created_at'),
    supabase.from('project_checkins').select('user_id, round_start, created_at, snapshot').eq('project_id', project.id),
    loadPolls(supabase, project.id),
    // 声かけ sent to me in this team (RLS shows only mine).
    supabase
      .from('nudges')
      .select('id, from_user_id, created_at')
      .eq('pairing_id', pod.podId)
      .eq('to_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])
  const tasks = (taskRows as TaskRow[] | null) ?? []
  const [{ totals: liveTotals, teamLive }, { data: sourceRows }] = await Promise.all([
    loadLiveTotals(supabase, project.id, tasks, userId),
    // Which of my tasks count from Google (no numbers here, 0023).
    tasks.length > 0
      ? supabase.from('task_sources').select('task_id, kind, file_id, label, state').in('task_id', tasks.map((x) => x.id))
      : Promise.resolve({ data: [] as SourceRow[] }),
  ])
  const sourceOf = new Map(((sourceRows as SourceRow[] | null) ?? []).map((r) => [r.task_id, r]))
  const linked = new Set(sourceOf.keys())
  const latest = latestCheckins(
    (checkinRows ?? []).map(
      (r): CheckinRow => ({ userId: r.user_id, roundStart: r.round_start, createdAt: r.created_at, snapshot: r.snapshot })
    )
  )
  const boardTasks = tasks.map((x) => {
    const shown = visibleTotal({ id: x.id, ownerId: x.owner_id, metric: x.metric }, userId, liveTotals, latest, teamLive)
    return {
      id: x.id,
      ownerId: x.owner_id,
      metric: x.metric,
      targetAmount: x.target_amount === null ? null : Number(x.target_amount),
      status: x.status,
      total: shown.total ?? 0,
      shownTotal: shown.total,
      due: x.due,
      title: x.title,
      unit: x.unit,
      inputMode: x.input_mode,
    }
  })
  const now = new Date()
  const number = new Intl.NumberFormat(locale)
  const percent = projectPercent(boardTasks)
  const mine = boardTasks.filter((x) => x.ownerId === userId)
  const unassigned = boardTasks.filter((x) => x.ownerId === null).length
  const myRounds = (checkinRows ?? []).filter((r) => r.user_id === userId).map((r) => r.round_start)
  const round = checkinStatus(project.start_date, project.checkin_every_days, myRounds, now)
  const nextMeeting = polls
    .filter((p) => isUpcoming(p, now))
    .sort((a, b) => (chosenStart(a) ?? '').localeCompare(chosenStart(b) ?? ''))[0]
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const board = `/classes/${classId}/project`

  let dueLine = tProject('noDeadline')
  if (project.deadline) {
    const left = tokyoDaysUntil(project.deadline, now)
    const date = tProject('due', { date: formatDate(project.deadline, locale) })
    dueLine = `${date} · ${left > 0 ? tProject('daysLeft', { count: left }) : left === 0 ? tProject('dueToday') : tProject('overdue')}`
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3 px-0.5">
        <div className="min-w-0">
          <p className="font-meta text-[13px] leading-7 text-muted">{t('projectKicker', { className })}</p>
          <h2 className="font-heading text-2xl leading-tight font-bold text-ink [overflow-wrap:anywhere]">{project.title}</h2>
          <p className="font-meta text-[13px] leading-7 text-muted">{dueLine}</p>
        </div>
        <Link href={board} className={secondaryButtonClass}>
          {t('openBoard')}
        </Link>
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7">
          <section aria-labelledby="home-my-tasks" className="rule-card tint-penna flex flex-col gap-3 px-5 py-5">
            <h3 id="home-my-tasks" className="font-heading text-lg leading-7 font-bold text-ink">
              {t('myTasks')}
            </h3>
            {mine.length === 0 ? (
              <p className="text-sm leading-7 text-ink">
                {unassigned > 0 ? t('noMyTasksClaim', { count: unassigned }) : t('noMyTasks')}
              </p>
            ) : (
              <ul className="flex flex-col">
                {mine.map((task) => {
                  const value = taskValueText(tProject, number, task, task.shownTotal)
                  const overdue = isOverdue(task, now)
                  return (
                    <li key={task.id} className="flex flex-col gap-1 border-b border-ink/10 py-3 first:pt-0 last:border-b-0 last:pb-0">
                      <div className="flex min-h-7 items-center justify-between gap-2.5">
                        <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</span>
                        <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[task.status]}`}>
                          {tProject(`status.${task.status}`)}
                        </span>
                      </div>
                      {value && task.targetAmount !== null && (
                        <div className="flex h-5 items-center">
                          <ProgressBar value={task.shownTotal ?? 0} max={task.targetAmount} valueText={value} />
                        </div>
                      )}
                      {/* Writing happens right here in the app (0030): 書く on a
                          document task, the offer on an empty characters task. */}
                      {task.inputMode === 'document' && task.status !== 'done' && (
                        <Link href={`${board}/tasks/${task.id}/write`} className={`${primaryButtonClass} mt-1 self-start`}>
                          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
                          {tProject('keepWriting')}
                        </Link>
                      )}
                      {task.inputMode === 'manual' && task.metric === 'characters' && (task.shownTotal ?? 0) === 0 && !linked.has(task.id) && task.status !== 'done' && (
                        <div className="mt-1">
                          <WriteInAppButton classId={classId} taskId={task.id} />
                        </div>
                      )}
                      {sourceOf.get(task.id)?.state === 'ok' && (
                        <div className="mt-1">
                          <OpenSourceButton
                            kind={sourceOf.get(task.id)!.kind}
                            fileId={sourceOf.get(task.id)!.file_id}
                            label={sourceOf.get(task.id)!.label}
                            changeHref={`/classes/${classId}/project/tasks/${task.id}/link`}
                            small
                          />
                        </div>
                      )}
                      {(value || task.due) && (
                        <p className={`font-meta text-xs leading-6 ${overdue ? 'font-bold text-ink' : 'text-ink'}`}>
                          {[value, task.due ? (overdue ? tProject('overdueTask') : tProject('dueTask', { date: formatDate(task.due, locale) })) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <div>
              <Link href={board} className={secondaryButtonClass}>
                {mine.length > 0 ? t('logOnBoard') : t('openBoard')}
              </Link>
            </div>
          </section>

          <section aria-label={tProject('overall', { percent })} className="rule-card flex items-center gap-6 px-5 py-5">
            <p aria-hidden className="font-heading text-[44px] leading-none font-light text-ink">
              {percent}
              <span className="text-xl">%</span>
            </p>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-sm leading-7 font-semibold text-ink">{t('teamProgress')}</p>
              <div className="flex h-6 items-center">
                <ProgressBar value={percent} max={100} valueText={tProject('overall', { percent })} />
              </div>
              <p className="text-[13px] leading-6 text-muted">{t('teamMembers', { count: members.length })}</p>
            </div>
          </section>
        </div>

        <aside aria-label={t('sideLabel')} className="flex min-w-0 flex-col gap-7">
          <section aria-labelledby="home-checkin" className="rule-card flex flex-col px-5 py-5">
            <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-muted">{tProject('checkin.kicker')}</p>
            <h3 id="home-checkin" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {formatDateWithWeekday(round.dueOn, locale)}
            </h3>
            <p className="text-[13px] leading-7 text-muted">
              {round.submitted
                ? tProject('checkin.done', { date: formatDate(round.nextRoundStart, locale) })
                : round.daysUntilDue > 0
                  ? tProject('checkin.left', { count: round.daysUntilDue })
                  : tProject('checkin.today')}
            </p>
            {!round.submitted && (
              <div className="pt-3">
                <Link href={`${board}/checkin`} className={`${secondaryButtonClass} w-full`}>
                  {tProject('checkin.submit')}
                </Link>
              </div>
            )}
          </section>

          {nextMeeting && (
            <section aria-labelledby="home-meeting" className="rule-card flex flex-col px-5 py-5">
              <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-muted">{tProject('meetingCard.kicker')}</p>
              <h3 id="home-meeting" className="font-heading text-[17px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">
                {nextMeeting.title}
              </h3>
              <p className="text-[13px] leading-7 text-muted">
                {formatMeeting(chosenStart(nextMeeting)!, nextMeeting.durationMinutes, locale)}
              </p>
              <Link
                href={`${board}/meetings/${nextMeeting.id}`}
                className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline underline-offset-4"
              >
                {tProject('meetingCard.open')}
              </Link>
            </section>
          )}

          <section aria-labelledby="home-nudges" className="rule-card flex flex-col px-5 py-5">
            <h3 id="home-nudges" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {t('nudgesHeading')}
            </h3>
            {(nudgeRows ?? []).length === 0 ? (
              <p className="text-[13px] leading-7 text-muted">{t('noNudges')}</p>
            ) : (
              <ul className="flex flex-col">
                {(nudgeRows ?? []).map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 text-sm leading-7 text-ink">
                    <span className="[overflow-wrap:anywhere]">{t('nudgeFrom', { name: nameOf.get(n.from_user_id) ?? tCommon('unknownPerson') })}</span>
                    <span className="shrink-0 font-meta text-xs text-muted">{formatTimeAgo(n.created_at, locale, now)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/nudges" className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline underline-offset-4">
              {t('seeNudges')}
            </Link>
          </section>

          <ClassAnnouncements classId={classId} />
        </aside>
      </div>
    </>
  )
}
