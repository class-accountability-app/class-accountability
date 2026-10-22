import { addDaysYmd, daysBetweenYmd, tokyoToday } from '@/lib/date'

// Check-in rounds. A project has a start date and a cadence (every N days,
// default 4). Round 1 is the N days from the start date, round 2 the next N,
// and so on, counted in Tokyo calendar days. Each member checks in once per
// round. checkinRoundStart() is the twin of the database's
// checkin_round_start(); the tests below use the same cases as
// supabase/tests/rls_group_projects.sql, so the two can't drift apart.

// The first day of the round that contains `today` ('YYYY-MM-DD'). Before the
// start date the round is the start date itself.
export function roundStartFor(start: string, everyDays: number, today: string): string {
  const elapsed = Math.max(daysBetweenYmd(start, today), 0)
  return addDaysYmd(start, Math.floor(elapsed / everyDays) * everyDays)
}

export type CheckinStatus = {
  roundStart: string // first day of the current round
  dueOn: string // last day of the current round: check in by then
  daysUntilDue: number // 0 on the due day itself
  submitted: boolean // this member has already checked in this round
  nextRoundStart: string
}

// Where one member stands in the current round. `submittedRounds` are the
// `round_start` dates of that member's check-ins.
export function checkinStatus(
  start: string,
  everyDays: number,
  submittedRounds: readonly string[],
  now: Date,
): CheckinStatus {
  const today = tokyoToday(now)
  const roundStart = roundStartFor(start, everyDays, today)
  const nextRoundStart = addDaysYmd(roundStart, everyDays)
  const dueOn = addDaysYmd(nextRoundStart, -1)
  // Before the start date the round hasn't begun: nothing to submit yet.
  return {
    roundStart,
    dueOn,
    daysUntilDue: daysBetweenYmd(today, dueOn),
    submitted: submittedRounds.includes(roundStart),
    nextRoundStart,
  }
}

// Members who haven't checked in for the round yet. `checkins` can hold every
// member's rows for any round; only the given round counts.
export function missingCheckins(
  memberIds: readonly string[],
  checkins: readonly { userId: string; roundStart: string }[],
  roundStart: string,
): string[] {
  const done = new Set(checkins.filter((c) => c.roundStart === roundStart).map((c) => c.userId))
  return memberIds.filter((id) => !done.has(id))
}

// The last round that has ended (the one whose check-ins the feed shows
// first), or null while the first round is still running.
export function previousRoundStart(start: string, everyDays: number, now: Date): string | null {
  const current = roundStartFor(start, everyDays, tokyoToday(now))
  return daysBetweenYmd(start, current) > 0 ? addDaysYmd(current, -everyDays) : null
}
