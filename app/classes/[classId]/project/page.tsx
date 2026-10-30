import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateWithWeekday, formatTimeAgo, tokyoDaysUntil } from '@/lib/date'
import { docUrl } from '@/lib/google-links'
import { groupTasksByOwner, isOverdue, projectPercent, type TaskLike } from '@/lib/project-stats'
import { latestCheckins, visibleTotal, type CheckinRow } from '@/lib/project-board'
import { checkinStatus } from '@/lib/checkin'
import { EmptyState } from '@/components/empty-state'
import { ProgressBar } from '@/components/progress-bar'
import { StatusStamp } from '@/components/status-stamp'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { CreateProjectForm } from './create-project-form'
import { STATUS_PILL_CLASS, loadLiveTotals, loadMyPodProject, taskValueText, type TaskRow } from './load'
import { chosenStart, formatMeeting, isUpcoming, loadPolls } from './meetings/load'
import { ClaimButton, TaskStatusControl } from './task-controls'
import { CreateGroupDocButton, GoogleSyncOnOpen } from './google-controls'
import { TaskLog } from './task-log'

type BoardTask = TaskLike & { title: string; unit: string | null; shown: ReturnType<typeof visibleTotal> }
type SourceRow = { task_id: string; kind: 'doc' | 'doc_section' | 'slides'; file_id: string; state: 'ok' | 'lost_access' }
const GOOGLE_RESULTS = ['connected', 'denied', 'failed', 'unavailable'] as const

// The team board (docs/mockups/phase4/group-projects.html, view "board"): the
// pod's one project, its tasks grouped by member. My own numbers are live;
// a teammate's numbers appear only as they shared them in their latest
// check-in (0022 RLS returns nothing else). With no project yet, any pod
// member starts it here.
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ google?: string }>
}) {
  const [{ classId }, { google: googleParam }] = await Promise.all([params, searchParams])
  const googleResult = GOOGLE_RESULTS.find((r) => r === googleParam) ?? null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: cls }, { data: membership }, t, tCommon, locale] = await Promise.all([
    supabase.from('classes').select('id, name, term').eq('id', classId).maybeSingle(),
    supabase.from('class_memberships').select('role').eq('class_id', classId).eq('user_id', user.id).maybeSingle(),
    getTranslations('project'),
    getTranslations('common'),
    getLocale() as Promise<Locale>,
  ])
  const tGoogle = await getTranslations('google')
  if (!cls) redirect('/classes')
  // Organizers (0015) are never in pods, so there is no project for them.
  if (membership?.role !== 'student') redirect(`/classes/${classId}`)

  const pod = await loadMyPodProject(supabase, classId, user.id, tCommon('unknownPerson'))

  const header = (
    <div className="px-0.5">
      <p className="font-meta text-[13px] leading-7 text-muted">{cls.term}</p>
      <p className="text-sm leading-7 text-muted">{cls.name}</p>
    </div>
  )
  const wrap = (children: React.ReactNode) => (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">{children}</div>
    </div>
  )

  if (!pod) {
    return wrap(
      <>
        {header}
        <EmptyState
          illustration="pod"
          title={t('noPodTitle')}
          body={t('noPodBody')}
          headingLevel="h1"
          ruled
          action={
            <Link href={`/classes/${classId}`} className={secondaryButtonClass}>
              {t('backToClass')}
            </Link>
          }
        />
      </>
    )
  }

  const { project, members } = pod

  if (!project) {
    return wrap(
      <>
        {header}
        <div className="px-0.5">
          <h1 className="font-heading text-[26px] leading-7 font-bold text-ink">{t('startTitle')}</h1>
          <p className="text-[13px] leading-7 text-muted">{t('startWhy')}</p>
        </div>
        <CreateProjectForm classId={classId} />
      </>
    )
  }

  const [{ data: taskRows }, { data: checkinRows }] = await Promise.all([
    supabase
      .from('project_tasks')
      .select('id, title, owner_id, metric, unit, target_amount, status, due')
      .eq('project_id', project.id)
      .order('position')
      .order('created_at'),
    supabase
      .from('project_checkins')
      .select('user_id, round_start, created_at, snapshot')
      .eq('project_id', project.id),
  ])
  const tasks = (taskRows as TaskRow[] | null) ?? []

  const [{ totals: liveTotals, teamLive }, polls, { data: sourceRows }, { data: hasGoogle }] = await Promise.all([
    loadLiveTotals(supabase, project.id, tasks, user.id),
    loadPolls(supabase, project.id),
    tasks.length > 0
      ? supabase.from('task_sources').select('task_id, kind, file_id, state').in('task_id', tasks.map((x) => x.id))
      : Promise.resolve({ data: [] as SourceRow[] }),
    supabase.rpc('has_google_connection'),
  ])
  // Google links (0023): what each task is counted from. A teammate's link
  // carries no numbers; my own linked tasks get their last read time.
  const sources = new Map(((sourceRows as SourceRow[] | null) ?? []).map((r) => [r.task_id, r]))
  const groupDocId = [...sources.values()].find((r) => r.kind === 'doc_section')?.file_id ?? null
  const myLinked = tasks.filter((x) => x.owner_id === user.id && sources.has(x.id))
  const lastChecked = new Map<string, string | null>()
  await Promise.all(
    myLinked.map(async (x) => {
      const { data } = await supabase.rpc('my_task_sync_status', { p_task: x.id }).maybeSingle<{ last_checked_at: string | null }>()
      lastChecked.set(x.id, data?.last_checked_at ?? null)
    })
  )
  // The 自動で記録 card shows on every started project; with nothing to count
  // yet it says so and points to adding a counted task.
  const hasCountedTask = tasks.some((x) => x.metric !== 'status')
  const hasCharactersTask = tasks.some((x) => x.metric === 'characters')

  const latest = latestCheckins(
    (checkinRows ?? []).map(
      (r): CheckinRow => ({ userId: r.user_id, roundStart: r.round_start, createdAt: r.created_at, snapshot: r.snapshot })
    )
  )

  const boardTasks: BoardTask[] = tasks.map((x) => {
    const shown = visibleTotal({ id: x.id, ownerId: x.owner_id, metric: x.metric }, user.id, liveTotals, latest, teamLive)
    return {
      id: x.id,
      ownerId: x.owner_id,
      metric: x.metric,
      targetAmount: x.target_amount === null ? null : Number(x.target_amount),
      status: x.status,
      total: shown.total ?? 0,
      due: x.due,
      title: x.title,
      unit: x.unit,
      shown,
    }
  })

  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const groups = groupTasksByOwner(boardTasks, members.map((m) => m.id), user.id)
  const now = new Date()
  const percent = projectPercent(boardTasks)
  const number = new Intl.NumberFormat(locale)

  let dueLine = t('noDeadline')
  if (project.deadline) {
    const left = tokyoDaysUntil(project.deadline, now)
    const date = t('due', { date: formatDate(project.deadline, locale) })
    dueLine = `${date} · ${left > 0 ? t('daysLeft', { count: left }) : left === 0 ? t('dueToday') : t('overdue')}`
  }

  const valueText = (task: BoardTask) => taskValueText(t, number, task, task.shown.total)

  // 次のチェックイン (mockup hero): when my share for this round is due.
  const myRounds = (checkinRows ?? []).filter((r) => r.user_id === user.id).map((r) => r.round_start)
  const round = checkinStatus(project.start_date, project.checkin_every_days, myRounds, now)

  // 次の打ち合わせ (automation mockup, board): the nearest confirmed meeting,
  // else a poll still being answered.
  const nextMeeting = polls
    .filter((p) => isUpcoming(p, now))
    .sort((a, b) => (chosenStart(a) ?? '').localeCompare(chosenStart(b) ?? ''))[0]
  const openPoll = polls.find((p) => p.status === 'open')
  const meetingsHref = `/classes/${classId}/project/meetings`
  const boardPath = `/classes/${classId}/project`
  const linkHref = (taskId: string) => `${boardPath}/tasks/${taskId}/link`

  return wrap(
    <>
      <div className="px-0.5">
        <p className="font-meta text-[13px] leading-7 text-muted">{cls.name}</p>
        <h1 className="font-heading text-[26px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">{project.title}</h1>
        <p className="font-meta text-xs leading-7 text-muted">{dueLine}</p>
        <div className="flex h-7 items-center">
          <ProgressBar value={percent} max={100} valueText={t('overall', { percent })} />
        </div>
        <p className="text-[13px] leading-7 text-muted">{t('overall', { percent })}</p>
      </div>

      <section aria-labelledby="checkin-heading" className="rule-card relative flex flex-col px-3.5 py-3.5 pl-[18px]">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
        <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('checkin.kicker')}</p>
        <h2 id="checkin-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {formatDateWithWeekday(round.dueOn, locale)}
        </h2>
        <p className="text-[13px] leading-7 text-muted">
          {round.submitted
            ? t('checkin.done', { date: formatDate(round.nextRoundStart, locale) })
            : round.daysUntilDue > 0
              ? t('checkin.left', { count: round.daysUntilDue })
              : t('checkin.today')}
        </p>
        <div className="flex flex-wrap gap-2.5 pt-3.5">
          {!round.submitted && (
            <Link href={`/classes/${classId}/project/checkin`} className={`${primaryButtonClass} flex-1`}>
              {t('checkin.submit')}
            </Link>
          )}
          <Link href={`/classes/${classId}/project/checkins`} className={`${secondaryButtonClass} flex-1`}>
            {t('checkin.feed')}
          </Link>
        </div>
      </section>

      <section aria-labelledby="meeting-heading" className="rule-card flex flex-col px-3.5 py-3.5">
        <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('meetingCard.kicker')}</p>
        <h2 id="meeting-heading" className="font-heading text-[17px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">
          {nextMeeting
            ? nextMeeting.title
            : openPoll
              ? t('meetingCard.voting', { title: openPoll.title })
              : t('meetingCard.none')}
        </h2>
        {nextMeeting && (
          <p className="text-[13px] leading-7 text-muted">
            {formatMeeting(chosenStart(nextMeeting)!, nextMeeting.durationMinutes, locale)}
          </p>
        )}
        <div className="pt-3.5">
          <Link
            href={nextMeeting ? `${meetingsHref}/${nextMeeting.id}` : openPoll ? `${meetingsHref}/${openPoll.id}` : `${meetingsHref}/new`}
            className={`${secondaryButtonClass} w-full`}
          >
            {nextMeeting ? t('meetingCard.open') : openPoll ? t('meetingCard.vote') : t('meetingCard.pick')}
          </Link>
        </div>
      </section>

      {sources.size > 0 && <GoogleSyncOnOpen />}
      {googleResult && (
        <p role="status" className={`px-0.5 text-sm leading-7 ${googleResult === 'connected' ? 'text-status-active' : 'text-accent-text'}`}>
          {tGoogle(`result.${googleResult}`)}
        </p>
      )}
      {(
        <section aria-labelledby="google-heading" className="rule-card flex flex-col px-3.5 py-3.5">
          <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{tGoogle('kicker')}</p>
          {groupDocId ? (
            <>
              <h2 id="google-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">{tGoogle('groupDocTitle')}</h2>
              <p className="text-[13px] leading-7 text-muted">{tGoogle('groupDocWhy')}</p>
              <div className="pt-3.5">
                <a href={docUrl(groupDocId)} target="_blank" rel="noopener noreferrer" className={`${secondaryButtonClass} w-full`}>
                  {tGoogle('groupDocOpen')}
                </a>
              </div>
            </>
          ) : hasGoogle && hasCharactersTask ? (
            <>
              <h2 id="google-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">{tGoogle('groupDocCreateTitle')}</h2>
              <p className="text-[13px] leading-7 text-muted">{tGoogle('groupDocCreateWhy')}</p>
              <div className="pt-3.5">
                <CreateGroupDocButton classId={classId} projectId={project.id} />
              </div>
            </>
          ) : hasGoogle ? (
            <>
              <h2 id="google-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">{tGoogle('connectedTitle')}</h2>
              <p className="text-[13px] leading-7 text-muted">{hasCountedTask ? tGoogle('noCharactersTask') : tGoogle('noCountedTask')}</p>
              <Link href={`${boardPath}/tasks/new`} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4">
                ＋ {tGoogle('addCountedTask')}
              </Link>
            </>
          ) : (
            <>
              <h2 id="google-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">{tGoogle('connectTitle')}</h2>
              <p className="text-[13px] leading-7 text-muted">{tGoogle('connectWhy')}</p>
              <div className="pt-3.5">
                <a href={`/api/google/connect?return=${encodeURIComponent(boardPath)}`} className={`${secondaryButtonClass} w-full`}>
                  {tGoogle('connect')}
                </a>
              </div>
              <p className="text-[13px] leading-7 text-muted">{tGoogle('connectFine')}</p>
              {!hasCountedTask && (
                <>
                  <p className="text-[13px] leading-7 text-muted">{tGoogle('noCountedTask')}</p>
                  <Link href={`${boardPath}/tasks/new`} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4">
                    ＋ {tGoogle('addCountedTask')}
                  </Link>
                </>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="members-heading" className="flex flex-col gap-7">
        <div className="-mb-7 flex items-start justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <h2 id="members-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {t('members')}
            </h2>
            <p className="text-[13px] leading-7 text-muted">{t(teamLive ? 'membersWhyLive' : 'membersWhy')}</p>
          </div>
        </div>

        {groups.map((group) => {
          const mine = group.ownerId === user.id
          const name =
            group.ownerId === null
              ? t('unassigned')
              : mine
                ? t('you', { name: nameOf.get(user.id) ?? '' })
                : (nameOf.get(group.ownerId) ?? tCommon('unknownPerson'))
          const checkin = group.ownerId && !mine ? latest.get(group.ownerId) : undefined
          return (
            <div
              key={group.ownerId ?? 'unassigned'}
              className="rule-card relative flex flex-col px-3.5 py-3.5"
            >
              {/* My own group gets the mockup's green edge (.mine). */}
              {mine && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-status-active" />}
              <div className="flex min-h-7 items-center gap-2.5">
                {group.ownerId !== null && <StatusStamp status={group.tasks.length > 0 ? 'active' : 'stale'} />}
                <h3 className="flex-1 text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{name}</h3>
                {(mine || (teamLive && group.ownerId !== null)) && (
                  <span className="font-meta text-xs leading-7 font-bold text-status-active">{t('live')}</span>
                )}
              </div>

              {group.tasks.length === 0 ? (
                <p className="text-[13px] leading-7 text-muted">{t('noTasksYet')}</p>
              ) : (
                <ul className="flex flex-col">
                  {group.tasks.map((task) => {
                    const value = valueText(task)
                    const overdue = isOverdue(task, now)
                    return (
                      <li key={task.id} className="flex flex-col border-b border-dashed border-border py-0 last:border-b-0">
                        <div className="flex min-h-7 items-center justify-between gap-2.5">
                          <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</span>
                          {mine ? (
                            <TaskStatusControl classId={classId} taskId={task.id} status={task.status} />
                          ) : (
                            <span className={`shrink-0 rounded-[2px] px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[task.status]}`}>
                              {t(`status.${task.status}`)}
                            </span>
                          )}
                        </div>
                        {value && <p className="text-[13px] leading-7 text-muted">{value}</p>}
                        {value && task.targetAmount !== null && (
                          <div className="flex h-7 items-center">
                            <ProgressBar value={task.shown.total ?? 0} max={task.targetAmount} valueText={value} />
                          </div>
                        )}
                        {task.due && (
                          <p className={`font-meta text-xs leading-7 ${overdue ? 'text-accent-text' : 'text-muted'}`}>
                            {overdue ? t('overdueTask') : t('dueTask', { date: formatDate(task.due, locale) })}
                          </p>
                        )}
                        {mine && sources.has(task.id) && (
                          <div className="flex flex-wrap items-center gap-x-3">
                            <p className={`font-meta text-xs leading-7 ${sources.get(task.id)!.state === 'ok' ? 'text-status-active' : 'text-accent-text'}`}>
                              {sources.get(task.id)!.state === 'ok'
                                ? `${tGoogle(`kind.${sources.get(task.id)!.kind}`)} · ${
                                    lastChecked.get(task.id)
                                      ? tGoogle('updated', { when: formatTimeAgo(lastChecked.get(task.id)!, locale, now) })
                                      : tGoogle('notYet')
                                  }`
                                : tGoogle('lost')}
                            </p>
                            <Link href={linkHref(task.id)} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-text underline underline-offset-4">
                              {sources.get(task.id)!.state === 'ok' ? tGoogle('change') : tGoogle('relink')}
                            </Link>
                          </div>
                        )}
                        {!mine && sources.get(task.id)?.kind === 'doc_section' && (
                          <p className="font-meta text-xs leading-7 text-muted">{tGoogle('teammateLinked')}</p>
                        )}
                        {mine && !sources.has(task.id) && task.metric !== 'status' && task.status !== 'done' && (
                          <>
                            <TaskLog classId={classId} taskId={task.id} title={task.title} metric={task.metric} unit={task.unit} />
                            <Link href={linkHref(task.id)} className="-mt-2 inline-flex min-h-11 items-center self-start pb-1 text-[13px] font-semibold text-accent-text underline underline-offset-4">
                              {tGoogle('linkTask')}
                            </Link>
                          </>
                        )}
                        {group.ownerId === null && (
                          <div className="pb-3.5">
                            <ClaimButton classId={classId} taskId={task.id} />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {group.ownerId !== null && !mine && !teamLive && (
                <p className="font-meta text-xs leading-7 text-muted">
                  {checkin ? t('asOf', { date: formatDate(checkin.roundStart, locale) }) : t('noCheckin')}
                </p>
              )}
              {mine && <p className="text-[13px] leading-7 text-muted">{t('log.fine')}</p>}
            </div>
          )
        })}

        <div className="px-0.5">
          <Link
            href={`/classes/${classId}/project/tasks/new`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            ＋ {t('addTask')}
          </Link>
        </div>
        <p className="px-0.5 text-[13px] leading-7 text-muted">{t('teacherSees')}</p>
      </section>
    </>
  )
}
