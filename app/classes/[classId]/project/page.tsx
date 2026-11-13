import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTimeAgo, tokyoDaysUntil } from '@/lib/date'
import { groupTasksByOwner, isOverdue, projectPercent } from '@/lib/project-stats'
import { latestCheckins, visibleTotal, type CheckinRow } from '@/lib/project-board'
import { checkinStatus } from '@/lib/checkin'
import { EmptyState } from '@/components/empty-state'
import { ProgressBar } from '@/components/progress-bar'
import { StatusStamp } from '@/components/status-stamp'
import { secondaryButtonClass } from '@/components/buttons'
import { CreateProjectForm } from './create-project-form'
import { loadLiveTotals, loadMyPodProject, taskValueText, type TaskRow } from './load'
import { chosenStart, formatMeeting, isUpcoming, loadPolls } from './meetings/load'
import { FinishProjectButton, ShareOutButton, TemplateTasksForm } from './task-controls'
import { GoogleSyncOnOpen } from './google-controls'
import { BoardTaskRow } from './board/task-row'
import { PlanCards } from './board/plan-cards'
import { GoogleCard } from './board/google-card'
import { TeamLinks, type TeamLink } from '@/components/project/team-links'
import { WhatChanged, type ChangeItem } from '@/components/project/what-changed'
import { boardActivity } from '@/lib/board-activity'
import { ProjectSwitcher } from '@/components/project/project-switcher'
import type { BoardTask, SourceRow } from './board/types'
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
  const wrap = (children: React.ReactNode, wide = false) => (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6">
      <div className={`mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl ${wide ? 'lg:max-w-6xl' : ''}`}>{children}</div>
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
        <div className="rule-card px-5 py-5">
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
          <h1 className="font-heading text-[28px] leading-tight font-bold text-ink lg:text-[36px]">
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
            <ul className="rule-card flex flex-col px-5 py-5">
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
      ? supabase.from('task_sources').select('task_id, kind, file_id, label, state').in('task_id', tasks.map((x) => x.id))
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
  const teammates = members.filter((m) => m.id !== user.id)
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
  const boardPath = `/classes/${classId}/project`

  // 声かけ in this team that I sent or received (RLS shows nothing else).
  const [{ data: nudgeRows }, tNudges, { data: presenceRows }, { data: depRows }, { data: milestoneRows }, tPlanning, { data: linkRows }, { data: activityTasks }, { data: projectMeta }] = await Promise.all([
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
    // 0043: チームのリンク (errors before that migration: the card is hidden).
    supabase.from('project_links').select('id, title, url, added_by, created_at').eq('project_id', project.id).order('created_at'),
    // 0044: 前回から変わったこと needs when tasks were made and finished.
    supabase.from('project_tasks').select('id, title, owner_id, created_at, done_at').eq('project_id', project.id),
    supabase.from('projects').select('created_at').eq('id', project.id).maybeSingle(),
  ])
  const deps = (depRows as Dependency[] | null) ?? null
  const milestone = nextMilestone((milestoneRows as Milestone[] | null) ?? [], percent, tokyoToday())
  // Feature batch 1: a gentle hint when open tasks are very unevenly shared.
  const balance = imbalance(openLoads(members.map((m) => m.id), tasks))
  const teamRows = members.map((m) => {
    const theirs = tasks.filter((x) => x.owner_id === m.id)
    return { id: m.id, name: m.name, total: theirs.length, done: theirs.filter((x) => x.status === 'done').length }
  })

  // 前回から変わったこと: teammates' recent events, as sentences. The browser
  // keeps only the ones newer than this device's last visit.
  const tChanged = await getTranslations('whatChanged')
  const changes: ChangeItem[] = activityTasks
    ? boardActivity(
        {
          me: user.id,
          projectCreatedAt: projectMeta?.created_at ?? null,
          tasks: activityTasks,
          checkins: (checkinRows ?? []).map((c) => ({ user_id: c.user_id, created_at: c.created_at })),
          polls,
          links: (linkRows as { id: string; title: string; added_by: string | null; created_at: string }[] | null) ?? [],
        },
        now
      ).map((e) => {
        const name = e.actorId ? (nameOf.get(e.actorId) ?? tCommon('unknownPerson')) : null
        return {
          id: e.id,
          at: e.at,
          text: name ? tChanged(`${e.kind}.by`, { name, title: e.subject }) : tChanged(`${e.kind}.plain`, { title: e.subject }),
          when: formatTimeAgo(e.at, locale, now),
        }
      })
    : []

  const planCards = (where: 'top' | 'side') => (
    <PlanCards
      classId={classId}
      where={where}
      round={round}
      nextMeeting={
        nextMeeting
          ? {
              id: nextMeeting.id,
              title: nextMeeting.title,
              when: formatMeeting(chosenStart(nextMeeting)!, nextMeeting.durationMinutes, locale),
            }
          : null
      }
      openPoll={openPoll ? { id: openPoll.id, title: openPoll.title } : null}
      locale={locale}
    />
  )

  return wrap(
    <NudgeListProvider nudges={(nudgeRows as NudgeItem[] | null) ?? []}>
      {/* Anyone in the team adds tasks (0022 RLS), not only the teacher's
          class project, so the button sits next to the title (screen A). */}
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3 px-0.5">
      <div className="min-w-0">
        <p className="font-meta text-[13px] leading-7 text-muted">{cls.name}</p>
        {teamName}
        <h1 className="font-heading text-[28px] leading-tight font-light text-ink [overflow-wrap:anywhere] lg:text-[36px]">
          {t('boardKicker')}
          <br />
          <span className="font-bold">{project.title}</span>
        </h1>
        <p className="pt-1 font-meta text-[13px] leading-7 text-muted">{dueLine}</p>
      </div>
        <Link href={`/classes/${classId}/project/tasks/new`} className={secondaryButtonClass}>
          ＋ {t('addTask')}
        </Link>
      </div>

      <ProjectSwitcher
        classId={classId}
        currentId={project.id}
        projects={pod.projects.map((p) => ({ id: p.id, title: p.title, due: p.deadline ? t('due', { date: formatDate(p.deadline, locale) }) : null }))}
      />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-7">
      <section aria-label={t('overall', { percent })} className="rule-card flex items-center gap-6 px-5 py-5">
        <p aria-hidden className="font-heading text-[52px] leading-none font-light text-ink">
          {percent}
          <span className="text-2xl">%</span>
        </p>
        <div className="flex min-w-0 flex-1 flex-col">
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
      </section>

      <WhatChanged projectId={project.id} items={changes} />

      <ClassAnnouncements classId={classId} />
      {inviteOnTop && inviteCard}

      <div className="flex flex-col gap-7 lg:hidden">{planCards('top')}</div>

      {sources.size > 0 && <GoogleSyncOnOpen />}
      {googleResult && (
        <p role="status" className={`px-0.5 text-sm leading-7 ${googleResult === 'connected' ? 'text-status-active' : 'text-accent-text'}`}>
          {tGoogle(`result.${googleResult}`)}
        </p>
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

        <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
        {groups.map((group) => {
          const mine = group.ownerId === user.id
          const name =
            group.ownerId === null
              ? t('unassigned')
              : mine
                ? t('you', { name: nameOf.get(user.id) ?? '' })
                : (nameOf.get(group.ownerId) ?? tCommon('unknownPerson'))
          const checkin = group.ownerId && !mine ? latest.get(group.ownerId) : undefined
          // Colour = meaning (2026-11-06): Penna is your own work, Hudson a
          // teammate with something past its due day. Words say it too.
          const late = !mine && group.ownerId !== null && group.tasks.some((task) => isOverdue(task, now))
          return (
            <div
              key={group.ownerId ?? 'unassigned'}
              className={`rule-card flex flex-col px-5 py-5 ${mine ? 'tint-penna' : late ? 'tint-hudson' : ''}`}
            >
              <div className="flex min-h-7 items-center gap-2.5">
                {group.ownerId !== null && <StatusStamp status={group.tasks.length > 0 ? 'active' : 'stale'} />}
                <h3 className="flex-1 text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{name}</h3>
                {(mine || (teamLive && group.ownerId !== null)) && (
                  <span className="rounded-full bg-ink px-2.5 font-meta text-xs leading-6 font-bold text-white">{t('live')}</span>
                )}
              </div>
              {group.ownerId !== null && !mine && (
                <NudgeForm podId={pod.podId} fromUserId={user.id} toUserId={group.ownerId} />
              )}

              {group.tasks.length === 0 ? (
                <p className="text-[13px] leading-7 text-muted">{t('noTasksYet')}</p>
              ) : (
                <ul className="flex flex-col">
                  {group.tasks.map((task) => (
                    <BoardTaskRow
                      key={task.id}
                      classId={classId}
                      userId={user.id}
                      task={task}
                      value={valueText(task)}
                      mine={mine}
                      unassigned={group.ownerId === null}
                      source={sources.get(task.id)}
                      lastChecked={mine ? lastChecked.get(task.id) : undefined}
                      waitingTitles={deps && task.status !== 'done' ? waitingOn(task.id, deps, tasks).map((w) => w.title) : []}
                      teammates={teammates}
                      locale={locale}
                      now={now}
                    />
                  ))}
                </ul>
              )}

              {group.ownerId === null && members.length > 1 && group.tasks.length > 0 && (
                <ShareOutButton classId={classId} projectId={project.id} count={group.tasks.length} />
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
        </div>

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

      <section aria-labelledby="nudges-heading" className="flex flex-col gap-3.5">
        <h2 id="nudges-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
          {tNudges('heading')}
        </h2>
        <NudgeList names={Object.fromEntries(nameOf)} unknownName={tCommon('unknownPerson')} />
      </section>
      </div>

      <aside aria-label={t('sideColumn')} className="flex min-w-0 flex-col gap-7">
        <div className="hidden lg:flex lg:flex-col lg:gap-7">{planCards('side')}</div>
        {linkRows && <TeamLinks classId={classId} projectId={project.id} links={linkRows as TeamLink[]} />}

        <GoogleCard boardPath={boardPath} groupDocId={groupDocId} hasGoogle={hasGoogle === true} hasCountedTask={hasCountedTask} />

      {presenceRows && (
        <TeamTable podId={pod.podId} me={user.id} members={teamRows} initial={presenceRows as PresenceRow[]} />
      )}

      </aside>
      </div>
    </NudgeListProvider>,
    true
  )
}
