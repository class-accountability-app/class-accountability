import { daysBetweenYmd, tokyoToday } from './date'

// The teacher's per-team summary (0027 class_team_summary, project first).
// Pure: how far along a team should be by today, and whether it is on track.

// The share of the project's days that have passed, 0..100, or null without a
// deadline. Tokyo days: the start day counts as 0%, the deadline as 100%.
export function expectedPercent(startDate: string, deadline: string | null, now: Date = new Date()): number | null {
  if (deadline === null) return null
  const total = daysBetweenYmd(startDate, deadline)
  if (total <= 0) return 100
  const passed = daysBetweenYmd(startDate, tokyoToday(now))
  return Math.round(Math.min(Math.max(passed / total, 0), 1) * 100)
}

export type TeamPace = 'notStarted' | 'onTrack' | 'behind'

// On track when the team is within 10 points of where it should be today. No
// deadline: on track once anything is under way (there is no pace to miss).
export function teamPace(
  team: { hasProject: boolean; percent: number; startDate: string | null; deadline: string | null },
  now: Date = new Date(),
): TeamPace {
  if (!team.hasProject || team.startDate === null) return 'notStarted'
  const expected = expectedPercent(team.startDate, team.deadline, now)
  if (expected === null) return 'onTrack'
  return team.percent >= expected - 10 ? 'onTrack' : 'behind'
}
