'use client'

import { memberStatuses, tintOf } from '@/lib/team-status'
import { useSharedTeamPresence } from './use-team-presence'

// One member's card of tasks on the board (the author's ask of 2026-11-15):
// white while that member is offline, their tint while they are online. My
// own card is always Penna: I am here, and Penna means "your own work". A
// teammate's is Hudson, Country Rubble or Farmer's Market (tintOf). The
// 「オンライン」 pill next to the name says it in words. Without the shared
// presence (before 0035) a teammate's card stays white.
export function OwnerCard({
  userId,
  me,
  memberIds,
  children,
}: {
  // null = the tasks nobody has yet.
  userId: string | null
  me: string
  memberIds: string[]
  children: React.ReactNode
}) {
  const shared = useSharedTeamPresence()
  const online =
    userId !== null &&
    (userId === me ||
      (shared !== null && memberStatuses(memberIds, shared.presence, shared.away).some((s) => s.id === userId && s.state === 'online')))
  return (
    <div className={`rule-card flex flex-col px-5 py-5 transition-colors duration-300 ${online ? `tint-${tintOf(memberIds, userId, me)}` : ''}`}>
      {children}
    </div>
  )
}
