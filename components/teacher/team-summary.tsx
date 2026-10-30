import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDayAgo } from '@/lib/date'
import { expectedPercent, teamPace, type TeamPace } from '@/lib/team-summary'
import { ProgressBar } from '@/components/progress-bar'

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

const PACE_PILL: Record<TeamPace, string> = {
  onTrack: 'bg-status-active text-white',
  behind: 'bg-accent text-white',
  notStarted: 'text-status-stale shadow-[inset_0_0_0_1px_var(--color-border)]',
}

// The organizer's view of the class (0027, project first): one line per team,
// from class_team_summary(), which returns no names, ids or per-person
// numbers. If the function isn't there yet, nothing is shown.
export async function TeamSummary({ classId }: { classId: string }) {
  const supabase = await createClient()
  const [{ data, error }, t, locale] = await Promise.all([
    supabase.rpc('class_team_summary', { p_class: classId }),
    getTranslations('teacher'),
    getLocale() as Promise<Locale>,
  ])
  if (error) return null
  const rows = (data as SummaryRow[] | null) ?? []
  const now = new Date()

  return (
    <section aria-labelledby="team-summary-heading" className="flex w-full max-w-md flex-col gap-3.5">
      <div>
        <h2 id="team-summary-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('title')}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{t('why')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm leading-7 text-muted">{t('noTeams')}</p>
      ) : (
        <ul className="rule-card flex flex-col px-3.5 py-3.5">
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
                    {t('team', { number: r.team_no })}
                    <span className="font-meta text-xs font-normal text-muted"> · {t('members', { count: r.members })}</span>
                  </span>
                  <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${PACE_PILL[pace]}`}>
                    {t(`pace.${pace}`)}
                  </span>
                </div>
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
