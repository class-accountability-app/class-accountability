import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime, formatDayAgo } from '@/lib/date'
import { projectPercent, type TaskLike } from '@/lib/project-stats'
import { tidyTotal } from '@/lib/project-board'
import type { TaskMetric, TaskStatus } from '@/lib/tasks'
import { otherProjects, otherTeams, type TeamProjectRow } from '@/lib/teacher-board'
import { ProgressBar } from '@/components/progress-bar'
import { STATUS_PILL_CLASS, taskValueText } from '../../project/load'

type BoardTask = {
  title: string
  owner: string | null
  metric: TaskMetric
  unit: string | null
  target_amount: number | string | null
  status: TaskStatus
  due: string | null
  total: number | string | null
  last_logged_at: string | null
  source_kind: string | null
  in_app: boolean
}
type SnapshotTask = {
  title: string
  metric?: TaskMetric
  unit?: string | null
  target_amount?: number | string | null
  total?: number | string | null
  status?: TaskStatus
}
type Board = {
  project: { id: string; title: string; start_date: string; deadline: string | null; status: 'active' | 'done' }
  team: { name: string | null; team_no: number; members: string[] }
  tasks: BoardTask[]
  checkins: { name: string | null; round_start: string; created_at: string; note: string | null; tasks: SnapshotTask[] }[]
  checkins_since: string
  links: { title: string; url: string }[]
  meetings: { title: string; status: 'open' | 'confirmed'; duration_minutes: number; starts_at: string | null }[]
}

const pill = (current: boolean) =>
  `inline-flex min-h-11 max-w-full items-center rounded-2xl px-4 py-1.5 text-sm font-semibold [overflow-wrap:anywhere] ${
    current ? 'bg-ink text-surface' : 'bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-surface-container'
  }`

// The teacher's read-only view of one team's project (0046, several projects
// at once, step 3). Everything comes from organizer_team_board(), which
// answers only the class's organizer and holds no writing, memo, 声かけ or
// email; there is nothing on this page to change. The two rows of pills move
// between teams doing the same class project and between this team's projects.
export default async function TeacherTeamBoard({ params }: { params: Promise<{ classId: string; projectId: string }> }) {
  const { classId, projectId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: boardData }, { data: teamRows }, t, tProject, locale] = await Promise.all([
    supabase.rpc('organizer_team_board', { p_project: projectId }),
    supabase.rpc('organizer_class_teams', { p_class: classId }),
    getTranslations('teacherBoard'),
    getTranslations('project'),
    getLocale() as Promise<Locale>,
  ])
  const board = boardData as Board | null
  if (!board) notFound()

  const rows = (teamRows as TeamProjectRow[] | null) ?? []
  // The project must belong to this class (the URL's class is only a path).
  const here = rows.find((r) => r.project_id === projectId)
  if (!here && board.project.status === 'active') notFound()
  const sameProject = here ? otherTeams(rows, here) : []
  const sameTeam = here ? otherProjects(rows, here) : []

  const now = new Date()
  const number = new Intl.NumberFormat(locale)
  const like: TaskLike[] = board.tasks.map((x, i) => ({
    id: String(i),
    ownerId: x.owner,
    metric: x.metric,
    targetAmount: x.target_amount === null ? null : Number(x.target_amount),
    status: x.status,
    total: x.total === null ? 0 : tidyTotal(Number(x.total)),
    due: x.due,
  }))
  const percent = projectPercent(like)
  const teamLabel = (name: string | null, no: number) => name ?? t('team', { number: no })
  const separator = locale === 'ja' ? '、' : ', '

  return (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl lg:max-w-5xl">
        <Link
          href={`/classes/${classId}`}
          className="-mb-2 -ml-2 inline-flex min-h-11 items-center self-start rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-container"
        >
          {t('back')}
        </Link>
        <div className="px-0.5">
          <p className="font-meta text-[13px] leading-7 text-muted">
            {teamLabel(board.team.name, board.team.team_no)} · {t('readOnly')}
          </p>
          <h1 className="font-heading text-[28px] leading-tight font-bold text-ink [overflow-wrap:anywhere] lg:text-[36px]">
            {board.project.title}
          </h1>
          <p className="pt-1 text-sm leading-7 text-ink [overflow-wrap:anywhere]">{board.team.members.join(separator)}</p>
          <p className="font-meta text-[13px] leading-7 text-muted">
            {board.project.deadline ? t('due', { date: formatDate(board.project.deadline, locale) }) : t('noDeadline')}
            {board.project.status === 'done' && ` · ${t('finished')}`}
          </p>
        </div>

        {sameProject.length > 1 && (
          <nav aria-label={t('sameProject')} className="flex flex-col gap-1.5">
            <p className="px-0.5 font-meta text-xs leading-6 font-bold tracking-[0.04em] text-accent-text">{t('sameProject')}</p>
            <ul className="flex flex-wrap gap-2">
              {sameProject.map((r) => (
                <li key={r.project_id} className="min-w-0">
                  <Link
                    href={`/classes/${classId}/teams/${r.project_id}`}
                    aria-current={r.project_id === projectId ? 'page' : undefined}
                    className={pill(r.project_id === projectId)}
                  >
                    {teamLabel(r.team_name, r.team_no)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {sameTeam.length > 1 && (
          <nav aria-label={t('sameTeam')} className="flex flex-col gap-1.5">
            <p className="px-0.5 font-meta text-xs leading-6 font-bold tracking-[0.04em] text-accent-text">{t('sameTeam')}</p>
            <ul className="flex flex-wrap gap-2">
              {sameTeam.map((r) => (
                <li key={r.project_id} className="min-w-0">
                  <Link
                    href={`/classes/${classId}/teams/${r.project_id}`}
                    aria-current={r.project_id === projectId ? 'page' : undefined}
                    className={pill(r.project_id === projectId)}
                  >
                    {r.project_title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <section aria-label={t('percent', { percent })} className="rule-card flex items-center gap-6 px-5 py-5">
          <p aria-hidden className="font-heading text-[52px] leading-none font-light text-ink">
            {percent}
            <span className="text-2xl">%</span>
          </p>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-7 items-center">
              <ProgressBar value={percent} max={100} valueText={t('percent', { percent })} />
            </div>
            <p className="text-sm leading-7 font-semibold text-ink">{t('percent', { percent })}</p>
          </div>
        </section>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section aria-labelledby="tb-tasks" className="rule-card flex flex-col px-5 py-5">
            <h2 id="tb-tasks" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {t('tasks')}
            </h2>
            {board.tasks.length === 0 && <p className="text-sm leading-7 text-muted">{t('noTasks')}</p>}
            <ul className="flex flex-col">
              {board.tasks.map((x, i) => {
                const value = taskValueText(tProject, number, { metric: x.metric, unit: x.unit, targetAmount: like[i].targetAmount }, x.total === null ? null : like[i].total)
                return (
                  <li key={i} className="flex flex-col border-b border-dashed border-ink/15 py-2 last:border-b-0">
                    <div className="flex min-h-7 items-center justify-between gap-2.5">
                      <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{x.title}</span>
                      <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[x.status]}`}>
                        {tProject(`status.${x.status}`)}
                      </span>
                    </div>
                    <span className="font-meta text-[13px] leading-6 text-muted">
                      {x.owner ?? t('noOwner')}
                      {value && ` · ${value}`}
                      {x.due && ` · ${t('due', { date: formatDate(x.due, locale) })}`}
                    </span>
                    {value && like[i].targetAmount !== null && (
                      <div className="flex h-7 items-center">
                        <ProgressBar value={like[i].total} max={like[i].targetAmount!} valueText={value} />
                      </div>
                    )}
                    <span className="font-meta text-xs leading-6 text-muted">
                      {x.last_logged_at ? t('lastLogged', { when: formatDayAgo(x.last_logged_at, locale, now) }) : t('nothingLogged')}
                      {x.in_app && ` · ${t('writtenInApp')}`}
                      {x.source_kind && ` · ${t('googleLinked')}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="flex min-w-0 flex-col gap-7">
            <section aria-labelledby="tb-checkins" className="rule-card flex flex-col px-5 py-5">
              <h2 id="tb-checkins" className="font-heading text-[17px] leading-7 font-bold text-ink">
                {t('checkins')}
              </h2>
              {board.checkins.length === 0 && <p className="text-sm leading-7 text-muted">{t('noCheckins')}</p>}
              <ul className="flex flex-col">
                {board.checkins.map((c, i) => (
                  <li key={i} className="flex flex-col border-b border-dashed border-ink/15 py-2 last:border-b-0">
                    <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">
                      {c.name ?? t('formerMember')}
                      <span className="font-meta text-xs font-normal text-muted"> · {formatDate(c.created_at, locale)}</span>
                    </span>
                    {c.note && <p className="text-sm leading-7 text-ink [overflow-wrap:anywhere]">{c.note}</p>}
                    {c.tasks.map((s, j) => {
                      const value =
                        s.metric && s.total !== null && s.total !== undefined
                          ? taskValueText(
                              tProject,
                              number,
                              {
                                metric: s.metric,
                                unit: s.unit ?? null,
                                targetAmount: s.target_amount === null || s.target_amount === undefined ? null : Number(s.target_amount),
                              },
                              tidyTotal(Number(s.total)),
                            )
                          : null
                      return (
                        <span key={j} className="font-meta text-[13px] leading-6 text-muted [overflow-wrap:anywhere]">
                          {s.title}
                          {value ? ` · ${value}` : s.status ? ` · ${tProject(`status.${s.status}`)}` : ''}
                        </span>
                      )
                    })}
                  </li>
                ))}
              </ul>
              <p className="pt-2 text-[13px] leading-6 text-muted">{t('checkinsSince', { date: formatDate(board.checkins_since, locale) })}</p>
            </section>

            {board.meetings.length > 0 && (
              <section aria-labelledby="tb-meetings" className="rule-card flex flex-col px-5 py-5">
                <h2 id="tb-meetings" className="font-heading text-[17px] leading-7 font-bold text-ink">
                  {t('meetings')}
                </h2>
                <ul className="flex flex-col">
                  {board.meetings.map((m, i) => (
                    <li key={i} className="flex flex-col border-b border-dashed border-ink/15 py-2 last:border-b-0">
                      <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{m.title}</span>
                      <span className="font-meta text-[13px] leading-6 text-muted">
                        {m.starts_at ? formatDateTime(m.starts_at, locale, now) : t('meetingOpen')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {board.links.length > 0 && (
              <section aria-labelledby="tb-links" className="rule-card flex flex-col px-5 py-5">
                <h2 id="tb-links" className="font-heading text-[17px] leading-7 font-bold text-ink">
                  {t('links')}
                </h2>
                <ul className="flex flex-col">
                  {board.links.map((l, i) => (
                    <li key={i} className="border-b border-dashed border-ink/15 py-1 last:border-b-0">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center text-[15px] font-semibold text-ink underline underline-offset-4 [overflow-wrap:anywhere]"
                      >
                        {l.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <p className="text-[13px] leading-7 text-muted">{t('notShown')}</p>
      </div>
    </div>
  )
}
