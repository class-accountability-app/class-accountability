import type { PresenceRow } from './team-status'

// Live presence (0051): who in a team has the app open right now, from the
// team's Supabase Realtime channel. Pure, so the provider
// (components/team/live-presence.tsx) and its tests agree.
//
// Realtime makes "online" instant both ways. Polling (team_presence, 0035/0050)
// stays underneath: it gives the last day opened, お休み and "opened today",
// and it is the whole answer while the channel isn't connected.

// One channel per team. The database allows exactly this shape (0051).
export function teamTopic(podId: string): string {
  return `team:${podId}`
}

// A phone that switches apps drops its connection for a moment. Someone who
// left counts as still here for this long, so their card doesn't flicker.
export const LEAVE_GRACE_MS = 10_000

// The members in a channel's presence state. The app tracks with the user id
// as the presence key, so a key with at least one entry is one person here
// (two tabs of the same person are two entries under one key).
export function liveMembers(state: Record<string, readonly unknown[]>): Set<string> {
  return new Set(Object.entries(state).filter(([, entries]) => entries.length > 0).map(([key]) => key))
}

// When each person who is no longer live left: added when they drop out of
// the channel, removed when they are back.
export function trackLeaves(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
  leftAt: ReadonlyMap<string, number>,
  now: number,
): Map<string, number> {
  const next = new Map(leftAt)
  for (const id of before) if (!after.has(id)) next.set(id, now)
  for (const id of after) next.delete(id)
  return next
}

// Who to show as here: everyone live, plus whoever left less than the grace
// period ago.
export function shownMembers(
  live: ReadonlySet<string>,
  leftAt: ReadonlyMap<string, number>,
  now: number,
  graceMs: number = LEAVE_GRACE_MS,
): Set<string> {
  const shown = new Set(live)
  for (const [id, at] of leftAt) if (now - at < graceMs) shown.add(id)
  return shown
}

// The team's polled rows with `online` from the live channel. While the
// channel isn't connected (null) the polled answer stands. While it is, live
// is the whole answer: someone who closed the app goes offline at once
// instead of after the 100-second window, and someone with 「オンライン表示」
// off never announces themselves, so they stay offline, as the setting promises.
export function applyLive(rows: readonly PresenceRow[], live: ReadonlySet<string> | null): PresenceRow[] {
  if (live === null) return [...rows]
  return rows.map((r) => ({ ...r, online: live.has(r.user_id) }))
}
