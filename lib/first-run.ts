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

// Where the student goes right after joining a class: the pod step for a
// first class, the class page (as before) for anyone else.
export function afterJoinHref(facts: FirstRunFacts, classId: string): string {
  return startsFirstRun(facts) ? podStepHref(classId) : `/classes/${classId}`
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
