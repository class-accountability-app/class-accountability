// Several projects at once (2026-11-13): a team can have more than one active
// project, and every project page shows one of them, the "current" one. Which
// one is a per-browser choice kept in a cookie (set by the board's switcher),
// so the pages' URLs stay as they are. Pure helpers, so they are tested.

export const CURRENT_PROJECT_COOKIE = 'sp_projects'
const MAX_ENTRIES = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The cookie's value: "classId:projectId,classId:projectId", one per class.
// Anything that isn't a pair of ids is dropped, so a hand-edited cookie can't
// carry anything else.
export function parseCurrentProjects(value: string | undefined | null): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of (value ?? '').split(',')) {
    const [classId, projectId] = part.split(':')
    if (classId && projectId && UUID.test(classId) && UUID.test(projectId)) out.set(classId, projectId)
  }
  return out
}

// The value after choosing a project in a class: that class moves to the
// end, and the oldest choices fall off past 12 classes.
export function withCurrentProject(value: string | undefined | null, classId: string, projectId: string): string {
  const map = parseCurrentProjects(value)
  map.delete(classId)
  if (UUID.test(classId) && UUID.test(projectId)) map.set(classId, projectId)
  return [...map.entries()]
    .slice(-MAX_ENTRIES)
    .map(([c, p]) => `${c}:${p}`)
    .join(',')
}

type Sortable = { id: string; deadline: string | null; created_at: string }

// A team's active projects in the order they are shown: due soonest first,
// no deadline last, then oldest first.
export function sortProjects<T extends Sortable>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) => {
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1
      if (b.deadline === null) return -1
      return a.deadline < b.deadline ? -1 : 1
    }
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id.localeCompare(b.id)
  })
}

// The project a page shows: the chosen one if it is still one of the team's
// active projects, otherwise the first (due soonest). Null with no projects.
export function pickCurrentProject<T extends Sortable>(projects: readonly T[], wantedId: string | null | undefined): T | null {
  const sorted = sortProjects(projects)
  return sorted.find((p) => p.id === wantedId) ?? sorted[0] ?? null
}
