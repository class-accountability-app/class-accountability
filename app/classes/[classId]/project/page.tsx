import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate, tokyoDaysUntil } from '@/lib/date'
import { groupTasksByOwner, isOverdue, projectPercent, type TaskLike } from '@/lib/project-stats'
import { latestCheckins, visibleTotal, type CheckinRow } from '@/lib/project-board'
import { tidyTotal } from '@/lib/quick-log'
import type { TaskMetric, TaskStatus } from '@/lib/tasks'
import { EmptyState } from '@/components/empty-state'
import { ProgressBar } from '@/components/progress-bar'
import { StatusStamp } from '@/components/status-stamp'
import { secondaryButtonClass } from '@/components/buttons'
import { CreateProjectForm } from './create-project-form'
import { ClaimButton, TaskStatusControl } from './task-controls'
import { TaskLog } from './task-log'

type TaskRow = {
  id: string
  title: string
  owner_id: string | null
  metric: TaskMetric
  unit: string | null
  target_amount: number | string | null
  status: TaskStatus
  due: string | null
}
type BoardTask = TaskLike & { title: string; unit: string | null; shown: ReturnType<typeof visibleTotal> }

// The team board (docs/mockups/phase4/group-projects.html, view "board"): the
// pod's one project, its tasks grouped by member. My own numbers are live;
// a teammate's numbers appear only as they shared them in their latest
// check-in (0022 RLS returns nothing else). With no project yet, any pod
// member starts it here.
export default async function ProjectPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
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
  if (!cls) redirect('/classes')
  // Organizers (0015) are never in pods, so there is no project for them.
  if (membership?.role !== 'student') redirect(`/classes/${classId}`)

  const { data: myPod } = await supabase
    .from('pairing_members')
    .select('pairing_id, pairings!inner(class_id, status)')
    .eq('user_id', user.id)
    .eq('pairings.class_id', classId)
    .eq('pairings.status', 'active')
    .limit(1)
    .maybeSingle()

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

  if (!myPod) {
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

  const [{ data: project }, { data: memberRows }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, title, start_date, deadline, checkin_every_days')
      .eq('pairing_id', myPod.pairing_id)
      .maybeSingle(),
    supabase
      .from('pairing_members')
      .select('user_id, joined_at, profiles(display_name)')
      .eq('pairing_id', myPod.pairing_id)
      .order('joined_at'),
  ])

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

  // Live totals for my own tasks. RLS returns only entries I logged or on
  // tasks I own, so nothing here can be a teammate's running number.
  const myTaskIds = tasks.filter((x) => x.owner_id === user.id && x.metric !== 'status').map((x) => x.id)
  const liveTotals = new Map<string, number>()
  if (myTaskIds.length > 0) {
    const { data: entries } = await supabase
      .from('task_progress')
      .select('task_id, progress_value')
      .in('task_id', myTaskIds)
    for (const e of entries ?? []) {
      liveTotals.set(e.task_id, tidyTotal((liveTotals.get(e.task_id) ?? 0) + Number(e.progress_value)))
    }
  }

  const latest = latestCheckins(
    (checkinRows ?? []).map(
      (r): CheckinRow => ({ userId: r.user_id, roundStart: r.round_start, createdAt: r.created_at, snapshot: r.snapshot })
    )
  )

  const boardTasks: BoardTask[] = tasks.map((x) => {
    const shown = visibleTotal({ id: x.id, ownerId: x.owner_id, metric: x.metric }, user.id, liveTotals, latest)
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

  const members = (memberRows ?? []).map((m) => ({
    id: m.user_id,
    name: (m.profiles as unknown as { display_name: string } | null)?.display_name ?? tCommon('unknownPerson'),
  }))
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

  function valueText(task: BoardTask): string | null {
    if (task.metric === 'status' || task.shown.total === null) return null
    const total = number.format(task.shown.total)
    if (task.metric === 'characters') {
      return task.targetAmount === null
        ? t('valueCharsNoGoal', { total })
        : t('valueChars', { total, target: number.format(task.targetAmount) })
    }
    return task.targetAmount === null
      ? t('valueCountNoGoal', { total, unit: task.unit ?? '' })
      : t('valueCount', { total, target: number.format(task.targetAmount), unit: task.unit ?? '' })
  }

  const pillClass: Record<TaskStatus, string> = {
    todo: 'text-status-stale shadow-[inset_0_0_0_1px_var(--color-border)]',
    doing: 'text-status-active shadow-[inset_0_0_0_1px_var(--color-status-active)]',
    done: 'bg-status-active text-white',
  }

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

      <section aria-labelledby="members-heading" className="flex flex-col gap-7">
        <div className="-mb-7 flex items-start justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <h2 id="members-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {t('members')}
            </h2>
            <p className="text-[13px] leading-7 text-muted">{t('membersWhy')}</p>
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
                {mine && <span className="font-meta text-xs leading-7 font-bold text-status-active">{t('live')}</span>}
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
                            <span className={`shrink-0 rounded-[2px] px-2 font-meta text-xs leading-5 font-bold ${pillClass[task.status]}`}>
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
                        {mine && task.metric !== 'status' && task.status !== 'done' && (
                          <TaskLog classId={classId} taskId={task.id} title={task.title} metric={task.metric} unit={task.unit} />
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

              {group.ownerId !== null && !mine && (
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
      </section>
    </>
  )
}
