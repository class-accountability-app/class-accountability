'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { formatDate, formatDayAgo } from '@/lib/date'
import { initialOf, lightOf, memberStatuses, onlineFirst, type AwayRow, type PresenceRow } from '@/lib/team-status'
import { StatusDot } from './status-dot'
import { useTeamPresence } from './use-team-presence'

// チームのいま (2026-11-15): who is here right now, at the top of Home and the
// board. One card per teammate, online people first, each with a badge, a
// status shape and the status in words; an online teammate's card lights up
// in their own colour. It shows only what the team already
// sees (0035, 0049): open now, the last DAY opened (never the time), お休み.
export function TeamStatus({
  podId,
  me,
  members,
  initial,
  initialAway,
  sharing,
}: {
  podId: string
  me: string
  members: { id: string; name: string }[]
  initial: PresenceRow[]
  initialAway: AwayRow[]
  // Whether my own green dot is shown to the team (設定 → オンライン表示).
  sharing: boolean
}) {
  const t = useTranslations('teamStatus')
  const locale = useLocale() as Locale
  const { presence, away } = useTeamPresence(podId, initial, initialAway)

  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const memberIds = members.map((m) => m.id)
  const statuses = onlineFirst(memberStatuses(memberIds, presence, away))
  const online = statuses.filter((s) => s.state === 'online').length

  return (
    <section aria-labelledby="team-status-heading" className="rule-card flex flex-col gap-2.5 px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="team-status-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('heading')}
        </h2>
        <p className="text-sm leading-7 font-semibold text-ink" aria-live="polite">
          {online > 0 ? t('count', { online, total: members.length }) : t('none')}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {statuses.map((s) => {
          const name = nameOf.get(s.id) ?? ''
          const line =
            s.state === 'online'
              ? t('openNow')
              : s.state === 'away'
                ? t('awayUntil', { date: formatDate(s.awayUntil!, locale) })
                : s.state === 'offline'
                  ? t('lastDay', { when: formatDayAgo(s.lastSeenDay!, locale) })
                  : t('never')
          return (
            <li
              key={s.id}
              // Online: the card lights up in this member's own light
              // (globals.css .member-card). The words and the dot still say it.
              className={`member-card light-${lightOf(memberIds, s.id)} flex items-center gap-3 rounded-2xl px-3 py-2 ${
                s.state === 'online' ? 'is-lit' : s.state === 'away' ? 'is-away' : ''
              }`}
            >
              <span className="relative shrink-0">
                <span
                  aria-hidden
                  className="member-badge flex h-10 w-10 items-center justify-center rounded-full bg-surface text-base font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]"
                >
                  {initialOf(name)}
                </span>
                <StatusDot state={s.state} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-surface" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] leading-6 font-semibold text-ink [overflow-wrap:anywhere]">
                  {s.id === me ? t('you', { name }) : name}
                </span>
                <span className={`text-[13px] leading-5 ${s.state === 'online' ? 'font-bold text-ink' : 'text-ink'}`}>{line}</span>
                {s.state === 'online' && s.awayUntil && (
                  <span className="text-xs leading-5 text-muted">{t('awayUntil', { date: formatDate(s.awayUntil, locale) })}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-[13px] leading-6 text-muted">
        {sharing ? t('sharingOn') : t('sharingOff')}{' '}
        <Link href="/settings" className="font-semibold text-ink underline underline-offset-4">
          {t('settings')}
        </Link>
      </p>
    </section>
  )
}
