// The first-run flow (Prompt 15): name + join → pod → first target → Home.
//
// It is started by an action the student takes (saving a name for a class they
// were invited to, or pressing "join"), never by looking at the state of a
// page. Home, the proxy and login never send anyone here, so a student who
// already uses the app can't be pulled into it. These counts are read right
// BEFORE the join is stored, for the student who is joining.

export type FirstRunFacts = {
  // Classes they study in (role 'student'); an organizer membership doesn't count.
  studentMemberships: number
  targets: number
  pods: number
}

// A student's very first class: nothing joined, nothing set, no pod.
export function startsFirstRun(facts: FirstRunFacts): boolean {
  return facts.studentMemberships === 0 && facts.targets === 0 && facts.pods === 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isClassId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function podStepHref(classId: string): string {
  return `/start/pod?class=${classId}`
}

export function targetStepHref(classId: string): string {
  return `/start/target?class=${classId}`
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

// What a /start/{step} page shows for this student in this class, as a
// redirect target, or null to render the step. Anyone who isn't a student of
// the class (a stranger, an organizer) or who already has a target here goes
// to Home; the pod step is skipped for someone who already has a pod.
export function startStepRedirect(
  step: 'pod' | 'target',
  state: { role: MemberRole | null; targetsInClass: number; inPod: boolean },
  classId: string
): string | null {
  if (state.role !== 'student' || state.targetsInClass > 0) return '/'
  if (step === 'pod' && state.inPod) return targetStepHref(classId)
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
