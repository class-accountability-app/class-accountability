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
import { ClaimButton, FinishProjectButton, TaskStatusControl, TemplateTasksForm, WriteInAppButton } from './task-controls'
import { CreateGroupDocButton, GoogleSyncOnOpen } from './google-controls'
import { TaskLog } from './task-log'
import { loadTeamInvite } from '@/app/team/load'
import { TeamInviteCard } from '@/components/team/team-invite-card'
import { ClassAnnouncements } from '@/components/class-announcements'
import { TaskTimeline } from '@/components/project/task-timeline'
import { TaskOrder } from '@/components/project/task-order'
import { nextMilestone, waitingOn, type Dependency, type Milestone } from '@/lib/planning'
import { imbalance, openLoads } from '@/lib/team-balance'
import { appOrigin } from '@/lib/app-origin'
import { tokyoToday } from '@/lib/date'
import { TeamName } from '@/components/team/team-name'
import { inviteFirst } from '@/lib/team-invite'
import { TeamTable, type PresenceRow } from '@/components/team/team-table'
import { TeamCodeForm } from '@/components/team/team-code-form'
import { NudgeForm } from '@/components/nudges/nudge-form'
import { NudgeList, NudgeListProvider, type NudgeItem } from '@/components/nudges/nudge-list'

type BoardTask = TaskLike & {
  title: string
  unit: string | null
  inputMode: 'manual' | 'document'
  shown: ReturnType<typeof visibleTotal>
}
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
        <div className="rule-card px-3.5 py-3.5">
          <TeamCodeForm />
        </div>
      </>
    )
  }

  const { project, members } = pod
  // 0036: the team's name (errors before that migration: then not shown).
  const { data: teamRow, error: teamNameError } = await supabase
    .from('pairings')
    .select('name')
    .eq('id', pod.podId)
    .maybeSingle<{ name: string | null }>()
  const teamName = !teamNameError && teamRow ? (
    <TeamName classId={classId} podId={pod.podId} name={teamRow.name} />
  ) : null
  // チームに招待する (0028): the code and QR while there is room.
  const invite = members.length < 6 ? await loadTeamInvite(supabase, pod.podId) : null
  const inviteCard = invite && (
    <TeamInviteCard
      podId={pod.podId}
      classId={classId}
      url={invite.url}
      shortUrl={invite.shortUrl}
      grouped={invite.grouped}
      qrSvg={invite.svg}
      className={cls.name}
      projectTitle={project?.title ?? null}
      small={inviteFirst(members.length)}
    />
  )
  // A team of 1 or 2 sees the invite before the tasks (item E).
  const inviteOnTop = inviteFirst(members.length)

  if (!project) {
    // 0033: finished projects stay as history; the team starts the next one.
    const { data: pastRows } = await supabase
      .from('projects')
      .select('id, title, finished_at')
      .eq('pairing_id', pod.podId)
      .eq('status', 'done')
      .order('finished_at', { ascending: false })
    const past = (pastRows as { id: string; title: string; finished_at: string }[] | null) ?? []
    return wrap(
      <>
        {header}
        {teamName && <div className="-mt-7 px-0.5">{teamName}</div>}
        <div className="px-0.5">
          <h1 className="font-heading text-[26px] leading-7 font-bold text-ink">
            {past.length > 0 ? t('nextTitle') : t('startTitle')}
          </h1>
          <p className="text-[13px] leading-7 text-muted">{past.length > 0 ? t('nextWhy') : t('startWhy')}</p>
        </div>
        {inviteOnTop && inviteCard}
        <CreateProjectForm classId={classId} />
        {!inviteOnTop && inviteCard}
        {past.length > 0 && (
          <section aria-labelledby="history-heading" className="flex flex-col gap-3.5">
            <h2 id="history-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
              {t('history.heading')}
            </h2>
            <ul className="rule-card flex flex-col px-3.5 py-3.5">
              {past.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/classes/${classId}/project/history/${p.id}`}
                    className="text-[15px] leading-7 font-semibold text-accent-text underline underline-offset-4 [overflow-wrap:anywhere]"
                  >
                    {p.title}
                  </Link>
                  <p className="font-meta text-xs leading-7 text-muted">
                    {t('history.finished', { date: formatDate(p.finished_at, locale) })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    )
  }

  const [{ data: taskRows }, { data: checkinRows }] = await Promise.all([
    supabase
      .from('project_tasks')
      .select('id, title, owner_id, metric, unit, target_amount, status, due, input_mode')
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
      inputMode: x.input_mode,
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

  // 声かけ in this team that I sent or received (RLS shows nothing else).
  const [{ data: nudgeRows }, tNudges, { data: presenceRows }, { data: depRows }, { data: milestoneRows }, tPlanning] = await Promise.all([
    supabase
      .from('nudges')
      .select('id, from_user_id, to_user_id, content, created_at')
      .eq('pairing_id', pod.podId)
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(20),
    getTranslations('nudges'),
    // チームのようす (0035). Before that migration this errors: no table then.
    supabase.rpc('team_presence', { p_pod: pod.podId }),
    // 0038: task order and the teacher's milestones (both error before it).
    tasks.length > 0
      ? supabase.from('task_dependencies').select('task_id, depends_on').in('task_id', tasks.map((x) => x.id))
      : Promise.resolve({ data: [] as Dependency[] }),
    supabase.from('class_milestones').select('id, title, due, target_percent').eq('class_id', classId),
    getTranslations('planning'),
  ])
  const deps = (depRows as Dependency[] | null) ?? null
  const milestone = nextMilestone((milestoneRows as Milestone[] | null) ?? [], percent, tokyoToday())
  // Feature batch 1: a gentle hint when open tasks are very unevenly shared.
  const balance = imbalance(openLoads(members.map((m) => m.id), tasks))
  const teamRows = members.map((m) => {
    const theirs = tasks.filter((x) => x.owner_id === m.id)
    return { id: m.id, name: m.name, total: theirs.length, done: theirs.filter((x) => x.status === 'done').length }
  })

  return wrap(
    <NudgeListProvider nudges={(nudgeRows as NudgeItem[] | null) ?? []}>
      <div className="px-0.5">
        <p className="font-meta text-[13px] leading-7 text-muted">{cls.name}</p>
        {teamName}
        <h1 className="font-heading text-[26px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">{project.title}</h1>
        <p className="font-meta text-xs leading-7 text-muted">{dueLine}</p>
        <div className="flex h-7 items-center">
          <ProgressBar value={percent} max={100} valueText={t('overall', { percent })} />
        </div>
        <p className="text-[13px] leading-7 text-muted">{t('overall', { percent })}</p>
        {milestone && (
          <p className={`text-[13px] leading-7 ${milestone.reached ? 'text-status-active' : 'text-muted'}`}>
            {tPlanning('boardMilestone', {
              title: milestone.milestone.title,
              date: formatDate(milestone.milestone.due, locale),
              percent: milestone.milestone.target_percent,
            })}{' '}
            · {milestone.reached ? tPlanning('boardMilestoneReached') : tPlanning('boardMilestoneGap', { gap: milestone.gap })}
          </p>
        )}
      </div>

      <ClassAnnouncements classId={classId} />
      {inviteOnTop && inviteCard}

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

      {presenceRows && (
        <TeamTable podId={pod.podId} me={user.id} members={teamRows} initial={presenceRows as PresenceRow[]} />
      )}

      {balance && (
        <p className="rounded-2xl bg-primary-container px-4 py-3 text-[13px] leading-6 text-on-primary-container">
          {t('balanceHint', {
            heavy: nameOf.get(balance.heavy.id) ?? tCommon('unknownPerson'),
            heavyCount: balance.heavy.open,
            light: nameOf.get(balance.light.id) ?? tCommon('unknownPerson'),
            lightCount: balance.light.open,
          })}
        </p>
      )}

      <TaskTimeline
        tasks={tasks.map((x) => ({ id: x.id, title: x.title, due: x.due, status: x.status }))}
        start={project.start_date}
        deadline={project.deadline}
        today={tokyoToday()}
        boardUrl={`${await appOrigin()}/classes/${classId}/project`}
      />

      {deps && tasks.length >= 2 && (
        <TaskOrder classId={classId} tasks={tasks.map((x) => ({ id: x.id, title: x.title }))} deps={deps} />
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

        {tasks.length === 0 && <TemplateTasksForm classId={classId} projectId={project.id} />}

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
              {group.ownerId !== null && !mine && (
                <NudgeForm podId={pod.podId} fromUserId={user.id} toUserId={group.ownerId} />
              )}

              {group.tasks.length === 0 ? (
                <p className="text-[13px] leading-7 text-muted">{t('noTasksYet')}</p>
              ) : (
                <ul className="flex flex-col">
                  {group.tasks.map((task) => {
                    const value = valueText(task)
                    const overdue = isOverdue(task, now)
                    const waits = deps && task.status !== 'done' ? waitingOn(task.id, deps, tasks) : []
                    return (
                      <li key={task.id} className="flex flex-col border-b border-dashed border-border py-0 last:border-b-0">
                        <div className="flex min-h-7 items-center justify-between gap-2.5">
                          <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</span>
                          {mine ? (
                            <TaskStatusControl classId={classId} taskId={task.id} status={task.status} />
                          ) : (
                            <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[task.status]}`}>
                              {t(`status.${task.status}`)}
                            </span>
                          )}
                        </div>
                        {value && <p className="text-[13px] leading-7 text-muted">{value}</p>}
                        {waits.length > 0 && (
                          <p className="text-[13px] leading-7 text-muted [overflow-wrap:anywhere]">
                            {tPlanning('waitingOn', { titles: waits.map((w) => w.title).join(tCommon('listSeparator')) })}
                          </p>
                        )}
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
                        {mine && task.inputMode === 'document' && (
                          <div className="pb-3.5">
                            <Link href={`${boardPath}/tasks/${task.id}/write`} className={secondaryButtonClass}>
                              {t('keepWriting')}
                            </Link>
                          </div>
                        )}
                        {mine && task.inputMode === 'manual' && !sources.has(task.id) && task.metric !== 'status' && task.status !== 'done' && (
                          <>
                            <TaskLog classId={classId} taskId={task.id} title={task.title} metric={task.metric} unit={task.unit} />
                            <Link href={linkHref(task.id)} className="-mt-2 inline-flex min-h-11 items-center self-start pb-1 text-[13px] font-semibold text-accent-text underline underline-offset-4">
                              {tGoogle('linkTask')}
                            </Link>
                            {task.metric === 'characters' && (task.shown.total ?? 0) === 0 && (
                              <div className="-mt-2 pb-1">
                                <WriteInAppButton classId={classId} taskId={task.id} />
                              </div>
                            )}
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
        {!inviteOnTop && inviteCard}
        <p className="px-0.5 text-[13px] leading-7 text-muted">{t('teacherSees')}</p>
        <div className="px-0.5">
          <FinishProjectButton classId={classId} projectId={project.id} />
        </div>
      </section>

      <section aria-labelledby="nudges-heading" className="flex flex-col gap-3.5">
        <h2 id="nudges-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
          {tNudges('heading')}
        </h2>
        <NudgeList names={Object.fromEntries(nameOf)} unknownName={tCommon('unknownPerson')} />
      </section>
    </NudgeListProvider>
  )
}
