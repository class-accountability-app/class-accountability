// The teacher's read-only team board (0046). organizer_class_teams() gives one
// row per team and active project; these pick the two rows of links on the
// board: the other teams doing the same class project, and the same team's
// other projects. Pure, so the rules are tested.

export type TeamProjectRow = {
  team_no: number
  team_name: string | null
  project_id: string
  project_title: string
  class_project_id: string | null
  deadline: string | null
}

// Every team's copy of the same class project, this one included, by team
// number. A project the team started itself has no counterpart elsewhere.
export function otherTeams(rows: readonly TeamProjectRow[], here: TeamProjectRow): TeamProjectRow[] {
  if (here.class_project_id === null) return [here]
  return rows.filter((r) => r.class_project_id === here.class_project_id).sort((a, b) => a.team_no - b.team_no)
}

// This team's active projects, this one included, in the order given (due
// soonest first).
export function otherProjects(rows: readonly TeamProjectRow[], here: TeamProjectRow): TeamProjectRow[] {
  return rows.filter((r) => r.team_no === here.team_no)
}

// The summary (class_team_summary) has no ids. Both functions list a team's
// active projects in the same order, so the n-th project line of a team is the
// n-th row here.
export function projectIdAt(rows: readonly TeamProjectRow[], teamNo: number, index: number): string | null {
  return rows.filter((r) => r.team_no === teamNo)[index]?.project_id ?? null
}
