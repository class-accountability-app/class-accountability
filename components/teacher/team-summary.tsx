import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDayAgo } from '@/lib/date'
import { expectedPercent, teamPace, type TeamPace } from '@/lib/team-summary'
import { ProgressBar } from '@/components/progress-bar'

type RosterName = { display_name: string; team_no: number | null; team_name: string | null }

type SummaryRow = {
  team_no: number
  members: number
  has_project: boolean
  start_date: string | null
  deadline: string | null
  task_count: number
  percent: number
  last_activity: string | null
  checkins_this_round: number
}

// Colour = meaning (2026-11-06): olive on track, Hudson with an outline for
// behind; the word says it too.
const PACE_PILL: Record<TeamPace, string> = {
  onTrack: 'bg-tint-olive text-ink',
  behind: 'bg-tint-hudson text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]',
  notStarted: 'bg-surface text-status-stale shadow-[inset_0_0_0_1px_var(--color-border)]',
}

// The organizer's view of the class (0027, project first): one line per team,
// from class_team_summary(), which returns no ids or per-person numbers.
// Since 0036 the organizer also sees who is in each team: names come from
// class_roster(), matched by team number (both count active teams in creation
// order). Before 0036 the names are simply left out.
export async function TeamSummary({ classId }: { classId: string }) {
  const supabase = await createClient()
  const [{ data, error }, { data: rosterRows }, { data: health }, t, locale] = await Promise.all([
    supabase.rpc('class_team_summary', { p_class: classId }),
    supabase.rpc('class_roster', { p_class: classId }),
    // 0042: Google links that can't be read or haven't been counted for a day.
    supabase.rpc('class_google_health', { p_class: classId }).maybeSingle<{ links: number; lost: number; stuck: number }>(),
    getTranslations('teacher'),
    getLocale() as Promise<Locale>,
  ])
  if (error) return null
  const rows = (data as SummaryRow[] | null) ?? []
  const namesByTeam = new Map<number, string[]>()
  const teamName = new Map<number, string>()
  for (const r of (rosterRows as RosterName[] | null) ?? []) {
    if (r.team_no === null) continue
    namesByTeam.set(r.team_no, [...(namesByTeam.get(r.team_no) ?? []), r.display_name])
    if (r.team_name) teamName.set(r.team_no, r.team_name)
  }
  const separator = locale === 'ja' ? '、' : ', '
  const now = new Date()
  // The numbers at a glance (screen D): whole-class counts only.
  const withProject = rows.filter((r) => r.has_project)
  const onTrack = rows.filter(
    (r) => teamPace({ hasProject: r.has_project, percent: r.percent, startDate: r.start_date, deadline: r.deadline }, now) === 'onTrack'
  ).length
  const average = withProject.length > 0 ? Math.round(withProject.reduce((a, r) => a + r.percent, 0) / withProject.length) : null
  const checkedIn = withProject.reduce((a, r) => a + r.checkins_this_round, 0)
  const inProjects = withProject.reduce((a, r) => a + r.members, 0)
  const stats = [
    { label: t('stats.onTrack'), value: `${onTrack} / ${rows.length}` },
    { label: t('stats.average'), value: average === null ? '—' : `${average}%` },
    { label: t('stats.checkins'), value: `${checkedIn} / ${inProjects}` },
  ]

  return (
    <section aria-labelledby="team-summary-heading" className="flex w-full flex-col gap-3.5">
      <div>
        <h2 id="team-summary-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('title')}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{t('why')}</p>
      </div>
      {health && (health.lost > 0 || health.stuck > 0) && (
        <div role="status" className="rule-card tint-hudson px-5 py-4 text-sm leading-6 text-ink">
          {health.lost > 0 && <p>{t('googleLost', { count: health.lost, links: health.links })}</p>}
          {health.stuck > 0 && <p>{t('googleStuck', { count: health.stuck, links: health.links })}</p>}
        </div>
      )}
      {rows.length > 0 && (
        <dl className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rule-card flex flex-col gap-1 px-4 py-4">
              <dt className="text-xs leading-5 font-semibold text-muted">{s.label}</dt>
              <dd className="font-heading text-2xl leading-tight font-bold text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {rows.length > 0 && (
        <a
          href={`/classes/${classId}/team-summary`}
          className="inline-flex min-h-11 items-center self-start text-[13px] font-semibold text-accent-text underline underline-offset-4"
        >
          {t('downloadCsv')}
        </a>
      )}
      {rows.length === 0 ? (
        <p className="text-sm leading-7 text-muted">{t('noTeams')}</p>
      ) : (
        <ul className="rule-card flex flex-col px-5 py-5">
          {rows.map((r) => {
            const pace = teamPace(
              { hasProject: r.has_project, percent: r.percent, startDate: r.start_date, deadline: r.deadline },
              now
            )
            const expected = r.start_date ? expectedPercent(r.start_date, r.deadline, now) : null
            const label = t('progress', { percent: r.percent })
            return (
              <li key={r.team_no} className="flex flex-col border-b border-dashed border-border py-1.5 last:border-b-0">
                <div className="flex min-h-7 items-center justify-between gap-2.5">
                  <span className="text-[15px] leading-7 font-semibold text-ink">
                    {teamName.get(r.team_no) ?? t('team', { number: r.team_no })}
                    <span className="font-meta text-xs font-normal text-muted"> · {t('members', { count: r.members })}</span>
                  </span>
                  <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${PACE_PILL[pace]}`}>
                    {t(`pace.${pace}`)}
                  </span>
                </div>
                {namesByTeam.has(r.team_no) && (
                  <p className="text-[13px] leading-6 text-ink [overflow-wrap:anywhere]">
                    {namesByTeam.get(r.team_no)!.join(separator)}
                  </p>
                )}
                {r.has_project ? (
                  <>
                    <div className="flex h-7 items-center">
                      <ProgressBar value={r.percent} max={100} valueText={label} />
                    </div>
                    <p className="font-meta text-xs leading-7 text-muted">
                      {label}
                      {expected !== null && ` · ${t('expected', { percent: expected })}`}
                      {' · '}
                      {r.last_activity ? t('lastActivity', { when: formatDayAgo(r.last_activity, locale, now) }) : t('noActivity')}
                      {' · '}
                      {t('checkins', { count: r.checkins_this_round, members: r.members })}
                    </p>
                  </>
                ) : (
                  <p className="font-meta text-xs leading-7 text-muted">{t('noProject')}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[13px] leading-7 text-muted">{t('privacy')}</p>
    </section>
  )
}
