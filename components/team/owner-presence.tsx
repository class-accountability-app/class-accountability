'use client'

import { useTranslations } from 'next-intl'
import { memberStatuses, tintOf } from '@/lib/team-status'
import { StatusDot } from './status-dot'
import { useSharedTeamPresence } from './use-team-presence'

// Next to an owner's name on the board: whether the person who has these
// tasks is here right now, where you would send a 声かけ. Online shows a pill
// with the word (the card itself takes their tint, owner-card.tsx); opened today shows the word in
// plain text; otherwise only the status shape. Nothing without the shared
// presence (before 0035, or outside the board).
export function OwnerPresence({ userId, memberIds, me }: { userId: string; memberIds: string[]; me: string }) {
  const t = useTranslations('teamStatus')
  const shared = useSharedTeamPresence()
  if (!shared) return null
  const status = memberStatuses(memberIds, shared.presence, shared.away).find((s) => s.id === userId)
  if (!status) return null

  if (status.state === 'online') {
    return (
      <span
        className={`member-pill light-${tintOf(memberIds, userId, me)} inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 font-meta text-xs leading-6 font-bold text-ink`}
      >
        <StatusDot state="online" className="h-2.5 w-2.5" />
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
