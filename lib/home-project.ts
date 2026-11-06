// Project first (2026-10-30, docs/plans/project-first-plan.md); since
// 2026-11-06 Home shows a summary of that project instead of redirecting. With projects in several
// classes, the one due soonest wins (no deadline goes last, then the oldest
// project). Pure; Home reads the rows (RLS returns only my pods' projects).

export type HomeProjectRow = {
  classId: string
  deadline: string | null // 'YYYY-MM-DD'
  createdAt: string
}

// The project Home shows (and the board the first-run step opens): the one
// due soonest.
export function pickHomeProject<T extends HomeProjectRow>(projects: readonly T[]): T | null {
  if (projects.length === 0) return null
  const [first] = [...projects].sort((a, b) => {
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1
      if (b.deadline === null) return -1
      return a.deadline < b.deadline ? -1 : 1
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })
  return first
}

export function homeProjectHref(projects: readonly HomeProjectRow[]): string | null {
  const first = pickHomeProject(projects)
  return first ? `/classes/${first.classId}/project` : null
}
