import { isAway } from './away'

// チームのいま (2026-11-15): what a teammate's status is, from what
// team_presence() (0035) and team_away() (0049) already give the team. Pure,
// so the strip on Home and the board and the team table say the same thing.
//   online   the app is open now (and they share it)
//   away     they said お休み and it hasn't ended
//   offline  not open now; the last day they opened it is known
//   never    they have not opened the app yet
// Online wins over away: someone who is here is here.

export type PresenceRow = { user_id: string; last_seen_day: string | null; online: boolean }
export type AwayRow = { user_id: string; away_until: string }
export type MemberState = 'online' | 'away' | 'offline' | 'never'

export type MemberStatus = {
  id: string
  state: MemberState
  // 'YYYY-MM-DD' of the last visit, when known.
  lastSeenDay: string | null
  // The last day of their break, while it runs (also set when they are online).
  awayUntil: string | null
}

export function memberStatuses(
  memberIds: readonly string[],
  presence: readonly PresenceRow[],
  away: readonly AwayRow[],
  now: Date = new Date(),
): MemberStatus[] {
  const seen = new Map(presence.map((r) => [r.user_id, r]))
  const until = new Map(away.filter((a) => isAway(a.away_until, now)).map((a) => [a.user_id, a.away_until]))
  return memberIds.map((id) => {
    const row = seen.get(id)
    const awayUntil = until.get(id) ?? null
    const state: MemberState = row?.online ? 'online' : awayUntil ? 'away' : row?.last_seen_day ? 'offline' : 'never'
    return { id, state, lastSeenDay: row?.last_seen_day ?? null, awayUntil }
  })
}

// Online first, then everyone else in the order given (the team's join order).
export function onlineFirst<T extends { state: MemberState }>(list: readonly T[]): T[] {
  return [...list.filter((m) => m.state === 'online'), ...list.filter((m) => m.state !== 'online')]
}

// The first character of a name, for the round badge: one grapheme, so an
// emoji or a combined character stays whole.
export function initialOf(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return '?'
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)[Symbol.iterator]().next()
  return first.done ? '?' : first.value.segment
}
