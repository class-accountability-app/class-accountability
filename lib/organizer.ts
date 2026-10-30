// The organizer's team tools (0036). Pure, so the forms, the actions and the
// tests share one set of rules (the database checks them again).

export const TEAM_NAME_MAX = 30
export const ANNOUNCEMENT_MAX = 500
export const AUTO_SPLIT_SIZES = [2, 3, 4, 5, 6] as const

export function isAutoSplitSize(value: unknown): value is (typeof AUTO_SPLIT_SIZES)[number] {
  return typeof value === 'number' && (AUTO_SPLIT_SIZES as readonly number[]).includes(value)
}

export type RosterRow = {
  user_id: string
  display_name: string
  pod_id: string | null
  team_no: number | null
  team_name: string | null
}

export type RosterTeam = { podId: string; teamNo: number; name: string | null; members: RosterRow[] }

// The roster as the page shows it: students without a team, then each team
// in creation order (team_no), members by name.
export function groupRoster(rows: readonly RosterRow[]): { unassigned: RosterRow[]; teams: RosterTeam[] } {
  const unassigned = rows.filter((r) => r.pod_id === null)
  const byPod = new Map<string, RosterTeam>()
  for (const r of rows) {
    if (r.pod_id === null) continue
    const team = byPod.get(r.pod_id) ?? { podId: r.pod_id, teamNo: r.team_no ?? 0, name: r.team_name, members: [] }
    team.members.push(r)
    byPod.set(r.pod_id, team)
  }
  const teams = [...byPod.values()].sort((a, b) => a.teamNo - b.teamNo)
  return { unassigned, teams }
}

// How auto-split will divide `waiting` students into teams of about `size`:
// the team sizes, as the database does it (round robin, differ by at most 1).
export function splitPreview(waiting: number, size: number): number[] {
  if (waiting <= 0) return []
  const k = Math.ceil(waiting / size)
  return Array.from({ length: k }, (_, i) => Math.floor(waiting / k) + (i < waiting % k ? 1 : 0))
}
