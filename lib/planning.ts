// Planning tools (0038): task order, meeting notes and the teacher's
// milestones. Pure, so the board and the forms share one set of rules.

export const MEETING_NOTE_MAX = 2000
export const MILESTONE_TITLE_MAX = 60
export const MILESTONE_MAX = 20

export type Dependency = { task_id: string; depends_on: string }
type TaskLite = { id: string; title: string; status: 'todo' | 'doing' | 'done' }

// The unfinished tasks this one waits for, in board order.
export function waitingOn(taskId: string, deps: Dependency[], tasks: TaskLite[]): TaskLite[] {
  const before = new Set(deps.filter((d) => d.task_id === taskId).map((d) => d.depends_on))
  return tasks.filter((x) => before.has(x.id) && x.status !== 'done')
}

// Whether "taskId waits for dependsOn" can be added: not itself, not already
// there, and no loop of any length (the database checks the same).
export function canAddDependency(taskId: string, dependsOn: string, deps: Dependency[]): boolean {
  if (taskId === dependsOn) return false
  if (deps.some((d) => d.task_id === taskId && d.depends_on === dependsOn)) return false
  const seen = new Set<string>()
  const stack = [dependsOn]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === taskId) return false
    if (seen.has(id)) continue
    seen.add(id)
    for (const d of deps) if (d.task_id === id) stack.push(d.depends_on)
  }
  return true
}

export type Milestone = { id: string; title: string; due: string; target_percent: number }

// The milestone a team should look at now: the first one due today or later,
// with whether the team's % already meets it. Dates are Tokyo YYYY-MM-DD.
export function nextMilestone(
  milestones: Milestone[],
  percent: number,
  today: string
): { milestone: Milestone; reached: boolean; gap: number } | null {
  const upcoming = milestones
    .filter((m) => m.due >= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  const m = upcoming[0]
  if (!m) return null
  return { milestone: m, reached: percent >= m.target_percent, gap: Math.max(0, m.target_percent - percent) }
}

export function isMilestoneInput(title: string, due: string, percent: number): boolean {
  const t = title.trim()
  return (
    [...t].length >= 1 &&
    [...t].length <= MILESTONE_TITLE_MAX &&
    /^\d{4}-\d{2}-\d{2}$/.test(due) &&
    Number.isInteger(percent) &&
    percent >= 1 &&
    percent <= 100
  )
}
