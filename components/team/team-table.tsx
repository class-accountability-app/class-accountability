'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { formatDate, formatDayAgo } from '@/lib/date'
import { memberStatuses, type AwayRow, type PresenceRow } from '@/lib/team-status'
import { StatusDot } from './status-dot'
import { useTeamPresence } from './use-team-presence'

export type { AwayRow, PresenceRow }
type Member = { id: string; name: string; done: number; total: number }

// チームのようす (item F): one row per teammate with the online dot, the day
// they last opened the app and their tasks done. The dot and day come from
// team_presence() (0035), refreshed every 30 seconds while the page is visible
// (use-team-presence.ts). Each state has its own shape and word (lib/team-status.ts).
// A teammate who set お休み (0049, team_away()) shows 「○日までお休み」.
export function TeamTable({
  podId,
  me,
  members,
  initial,
  initialAway,
}: {
  podId: string
  me: string
  members: Member[]
  initial: PresenceRow[]
  initialAway: AwayRow[]
}) {
  const t = useTranslations('teamTable')
  const locale = useLocale() as Locale
  const { presence, away } = useTeamPresence(podId, initial, initialAway)
  const statusOf = new Map(memberStatuses(members.map((m) => m.id), presence, away).map((x) => [x.id, x]))
  const onlineCount = members.filter((m) => statusOf.get(m.id)?.state === 'online').length

  return (
    <section aria-labelledby="team-table-heading" className="rule-card flex flex-col px-5 py-5">
      <h2 id="team-table-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('heading')}
      </h2>
      <p className="text-[13px] leading-7 text-muted" aria-live="polite">
        {onlineCount > 0 ? t('onlineNow', { count: onlineCount }) : t('onlineNone')}
      </p>
      <table className="mt-1.5 w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="py-1 font-semibold">{t('member')}</th>
            <th scope="col" className="py-1 font-semibold">{t('lastSeen')}</th>
            <th scope="col" className="py-1 text-right font-semibold">{t('tasks')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const status = statusOf.get(m.id)!
            const online = status.state === 'online'
            return (
              <tr key={m.id} className="border-t border-dashed border-border">
                <th scope="row" className="py-2 pr-2 font-semibold text-ink [overflow-wrap:anywhere]">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot state={status.state} />
                    {m.id === me ? t('you', { name: m.name }) : m.name}
                    <span className="sr-only">{online ? t('online') : t('offline')}</span>
                  </span>
                  {status.awayUntil && (
                    <span className="mt-0.5 block text-xs font-normal text-ink">
                      <span className="rounded-lg bg-tint-hudson px-2 py-0.5">
                        {t('away', { date: formatDate(status.awayUntil, locale) })}
                      </span>
                    </span>
                  )}
                </th>
                <td className="py-2 pr-2 text-muted">
                  {online ? (
                    <span className="font-semibold text-status-active">{t('online')}</span>
                  ) : status.lastSeenDay ? (
                    formatDayAgo(status.lastSeenDay, locale)
                  ) : (
                    t('never')
                  )}
                </td>
                <td className="py-2 text-right font-meta text-ink">
                  {m.total === 0 ? '—' : t('taskCount', { done: m.done, total: m.total })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="pt-1.5 text-xs leading-6 text-muted">{t('note')}</p>
    </section>
  )
}
