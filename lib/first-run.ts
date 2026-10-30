// The first-run flow (Prompt 15, project first since 2026-10-30): name + join
// → team → the team's project.
//
// It is started by an action the student takes (saving a name for a class they
// were invited to, or pressing "join"), never by looking at the state of a
// page. Home, the proxy and login never send anyone here, so a student who
// already uses the app can't be pulled into it. These counts are read right
// BEFORE the join is stored, for the student who is joining.

export type FirstRunFacts = {
  // Classes they study in (role 'student'); an organizer membership doesn't count.
  studentMemberships: number
  pods: number
}

// A student's very first class: nothing joined, no team.
export function startsFirstRun(facts: FirstRunFacts): boolean {
  return facts.studentMemberships === 0 && facts.pods === 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isClassId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function podStepHref(classId: string): string {
  return `/start/pod?class=${classId}`
}

export function projectStepHref(classId: string): string {
  return `/classes/${classId}/project`
}

export type MemberRole = 'student' | 'organizer'

// Where the student goes right after joining a class: the pod step for a
// student's very first class, the class page (as before) for anyone else. An
// organizer opening their own class's link is "already a member" with the
// organizer role: never the flow, always their class page. An unknown role
// (a failed read) also means the class page.
export function afterJoinHref(facts: FirstRunFacts, classId: string, role: MemberRole | null): string {
  return role === 'student' && startsFirstRun(facts) ? podStepHref(classId) : `/classes/${classId}`
}

// What /start/pod shows for this student in this class, as a redirect target,
// or null to render the step. Anyone who isn't a student of the class (a
// stranger, an organizer) goes to Home; someone already in a team, straight to
// the project.
export function startStepRedirect(state: { role: MemberRole | null; inPod: boolean }, classId: string): string | null {
  if (state.role !== 'student') return '/'
  if (state.inPod) return projectStepHref(classId)
  return null
}

// /welcome?next=/join/K7M3Q9TX → the code in `next`, or null. Only the shape is
// checked here; the database decides whether the code is a real class's.
export function joinCodeFromNext(next: string | null | undefined): string | null {
  if (typeof next !== 'string') return null
  const match = next.match(/^\/join\/([^/?#]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
