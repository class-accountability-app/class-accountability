// はじめの3ステップ on Home (screen 05). Worked out from real data on every
// load (memberships, pods, targets); nothing about it is stored.

export type HomeClass = {
  id: string
  name: string
  term: string
  // Members in the student's active pod in this class, or null for no pod.
  podSize: number | null
  // The class's organizer (0015): not a student there, so it doesn't count
  // towards the checklist.
  organizer: boolean
}

export type StepId = 'join' | 'pod' | 'target'

export type Checklist = {
  steps: { id: StepId; done: boolean }[]
  doneCount: number
  allDone: boolean
  // The first unfinished step: the only one that gets an action.
  next: StepId | null
  // Its button's link. Null for 'join': that step gets the コードで参加 field
  // instead, since a class can only be joined with its code (0013).
  nextHref: string | null
  // For "統計学 201 に参加しました" under a finished first step.
  joinedClassName: string | null
}

// `classes` in the order the student joined them. Classes you organize are
// left out: the steps are about studying in a class.
export function buildChecklist(allClasses: HomeClass[], hasTarget: boolean): Checklist {
  const classes = allClasses.filter((c) => !c.organizer)
  const withPod = classes.find((c) => c.podSize !== null)
  const withoutPod = classes.find((c) => c.podSize === null)

  const steps: Checklist['steps'] = [
    { id: 'join', done: classes.length > 0 },
    { id: 'pod', done: withPod !== undefined },
    { id: 'target', done: hasTarget },
  ]
  const next = steps.find((s) => !s.done)?.id ?? null

  let nextHref: string | null = null
  if (next === 'pod' && withoutPod) nextHref = `/classes/${withoutPod.id}`
  if (next === 'target') {
    const cls = withPod ?? classes[0]
    nextHref = cls ? `/classes/${cls.id}/targets/new` : '/classes'
  }

  const doneCount = steps.filter((s) => s.done).length
  return {
    steps,
    doneCount,
    allDone: doneCount === steps.length,
    next,
    nextHref,
    joinedClassName: classes[0]?.name ?? null,
  }
}

// The "all done" line shows once, then the checklist hides. This cookie only
// remembers that the student has seen that line (it holds their user id, so
// another account on the same browser still sees its own); it never stores
// progress.
export const SETUP_SEEN_COOKIE = 'setup_done_seen'
