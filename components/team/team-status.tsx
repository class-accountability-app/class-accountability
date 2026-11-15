'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { formatDate, formatDayAgo } from '@/lib/date'
import { initialOf, lightOf, memberStatuses, onlineFirst, type AwayRow, type MemberStatus, type PresenceRow } from '@/lib/team-status'
import { StatusDot } from './status-dot'
import { useTeamPresence } from './use-team-presence'

// チームのいま (2026-11-15): who is here right now, at the top of Home and the
// board. One card per teammate, online people first, each with a badge, a
// status shape and the status in words; an online teammate's card lights up
// in their own colour. It shows only what the team already
// sees (0035, 0049): open now, the last DAY opened (never the time), お休み.
// 「今日開きました」 is that same day, said as its own state. On phones the
// cards fold into one row of badges.
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

  const card = (s: MemberStatus) => {
    const name = nameOf.get(s.id) ?? ''
    const line =
      s.state === 'online'
        ? t('openNow')
        : s.state === 'away'
          ? t('awayUntil', { date: formatDate(s.awayUntil!, locale) })
          : s.state === 'today'
            ? t('today')
            : s.state === 'offline'
              ? t('lastDay', { when: formatDayAgo(s.lastSeenDay!, locale) })
              : t('never')
    return (
      <li
        key={s.id}
        // Online: the card lights up in this member's own light
        // (globals.css .member-card). The words and the dot still say it.
        className={`member-card light-${lightOf(memberIds, s.id)} flex items-center gap-3 rounded-2xl px-3 py-2 ${
          s.state === 'online' ? 'is-lit' : s.state === 'away' ? 'is-away' : s.state === 'today' ? 'is-today' : ''
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
  }

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
      {/* Phones: one row of badges (a tap opens everyone's card), so the
          team's status doesn't fill the first screen. From 640px the cards
          are always shown. */}
      <details className="group sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
          {statuses.map((s) => (
            <span key={s.id} className="relative shrink-0">
              <span
                aria-hidden
                className={`member-badge-solo light-${lightOf(memberIds, s.id)} ${s.state === 'online' ? 'is-lit' : ''} flex h-10 w-10 items-center justify-center rounded-full bg-surface text-base font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]`}
              >
                {initialOf(nameOf.get(s.id) ?? '')}
              </span>
              <StatusDot state={s.state} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-surface" />
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-4">
            <span className="group-open:hidden">{t('showAll')}</span>
            <span className="hidden group-open:inline">{t('hideAll')}</span>
          </span>
        </summary>
        <ul className="grid grid-cols-1 gap-2 pt-2.5">{statuses.map(card)}</ul>
      </details>
      <ul className="hidden gap-2 sm:grid sm:grid-cols-2">{statuses.map(card)}</ul>
      <p className="text-[13px] leading-6 text-muted">
        {sharing ? t('sharingOn') : t('sharingOff')}{' '}
        <Link href="/settings" className="font-semibold text-ink underline underline-offset-4">
          {t('settings')}
        </Link>
      </p>
    </section>
  )
}
