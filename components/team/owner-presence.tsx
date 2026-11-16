'use client'

import { useTranslations } from 'next-intl'
import { memberStatuses } from '@/lib/team-status'
import { StatusStamp } from '@/components/status-stamp'
import { StatusDot } from './status-dot'
import { useSharedTeamPresence } from './use-team-presence'

// Next to an owner's name on the board: whether the person who has these
// tasks is here right now, where you would send a 声かけ. Online shows a solid
// green pill with the word (the card itself takes their tint, owner-card.tsx); opened today shows the word in
// plain text; otherwise only the status shape. Nothing without the shared
// presence (before 0035, or outside the board).
export function OwnerPresence({ userId, memberIds }: { userId: string; memberIds: string[]; me?: string }) {
  const t = useTranslations('teamStatus')
  const shared = useSharedTeamPresence()
  if (!shared) return null
  const status = memberStatuses(memberIds, shared.presence, shared.away).find((s) => s.id === userId)
  if (!status) return null

  if (status.state === 'online') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-online-strong px-2.5 font-meta text-xs leading-6 font-bold text-white">
        <span aria-hidden className="online-pulse inline-block h-2 w-2 rounded-full bg-white" />
        {t('ownerOnline')}
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-meta text-xs leading-6 text-muted">
      <StatusDot state={status.state} className="h-2.5 w-2.5" />
      {status.state === 'today' ? t('ownerToday') : status.state === 'away' ? t('ownerAway') : <span className="sr-only">{t('ownerOffline')}</span>}
    </span>
  )
}

// The mark at the top of each member's card on the board (the author's ask of
// 2026-11-16): the green online dot, pulsing, while that member is online, and
// otherwise the old stamp (filled when they have tasks, a ring when they have
// none). On my own card it follows what my team sees: green only while my
// 「オンライン表示」 is on. The words (the 「オンライン」 pill, チームのいま)
// say the same thing, so the colour is never the only signal.
export function OwnerStamp({ userId, memberIds, hasTasks }: { userId: string; memberIds: string[]; hasTasks: boolean }) {
  const shared = useSharedTeamPresence()
  const online =
    shared !== null &&
    memberStatuses(memberIds, shared.presence, shared.away).some((s) => s.id === userId && s.state === 'online')
  if (online) return <StatusDot state="online" className="h-4 w-4" />
  return <StatusStamp status={hasTasks ? 'active' : 'stale'} />
}
