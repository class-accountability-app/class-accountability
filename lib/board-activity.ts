// 前回から変わったこと (0044): what happened on the team's board, built only
// from things a teammate can already see there (a task added or finished, a
// check-in shared, a meeting poll opened, a team link pinned). No numbers, no
// notes, nothing from the writing. Pure, so it is tested.

export type ActivityKind = 'taskDone' | 'taskAdded' | 'checkin' | 'pollOpened' | 'linkAdded'

export type ActivityEvent = {
  id: string
  kind: ActivityKind
  at: string // ISO time
  actorId: string | null // who did it, when the data says so
  subject: string // the task's, poll's or link's title; '' for a check-in
}

export const ACTIVITY_WINDOW_DAYS = 14
// Tasks made in the project's first minutes came with it (a template or the
// teacher's class project), so they aren't news.
const STARTING_TASKS_MS = 2 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type ActivityInput = {
  me: string
  projectCreatedAt: string | null
  tasks: readonly { id: string; title: string; owner_id: string | null; created_at: string; done_at: string | null }[]
  checkins: readonly { user_id: string; created_at: string }[]
  polls: readonly { id: string; title: string; createdBy: string | null; createdAt: string; status: string }[]
  links: readonly { id: string; title: string; added_by: string | null; created_at: string }[]
}

// Other people's events from the last two weeks, newest first. My own are
// left out wherever the data says who did it (finishing counts as the task
// owner's doing).
export function boardActivity(input: ActivityInput, now: Date): ActivityEvent[] {
  const since = now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS
  const started = input.projectCreatedAt ? new Date(input.projectCreatedAt).getTime() : null
  const events: ActivityEvent[] = []

  for (const t of input.tasks) {
    if (t.done_at && t.owner_id !== input.me) {
      events.push({ id: `done:${t.id}`, kind: 'taskDone', at: t.done_at, actorId: t.owner_id, subject: t.title })
    }
    const made = new Date(t.created_at).getTime()
    if (started === null || made - started > STARTING_TASKS_MS) {
      events.push({ id: `added:${t.id}`, kind: 'taskAdded', at: t.created_at, actorId: null, subject: t.title })
    }
  }
  for (const c of input.checkins) {
    if (c.user_id !== input.me) {
      events.push({ id: `checkin:${c.user_id}:${c.created_at}`, kind: 'checkin', at: c.created_at, actorId: c.user_id, subject: '' })
    }
  }
  for (const p of input.polls) {
    if (p.createdBy !== input.me && p.status !== 'cancelled') {
      events.push({ id: `poll:${p.id}`, kind: 'pollOpened', at: p.createdAt, actorId: p.createdBy, subject: p.title })
    }
  }
  for (const l of input.links) {
    if (l.added_by !== input.me) {
      events.push({ id: `link:${l.id}`, kind: 'linkAdded', at: l.created_at, actorId: l.added_by, subject: l.title })
    }
  }

  return events
    .filter((e) => {
      const at = new Date(e.at).getTime()
      return Number.isFinite(at) && at >= since && at <= now.getTime()
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}

export const FIRST_VISIT_DAYS = 3

// What is new for this viewer: everything after the time they last had the
// board open, or, on a device that has never opened it, the last three days.
export function freshSince<T extends { at: string }>(events: readonly T[], seenAt: string | null, now: Date): T[] {
  const seen = seenAt ? new Date(seenAt).getTime() : NaN
  const threshold = Number.isFinite(seen) ? seen : now.getTime() - FIRST_VISIT_DAYS * DAY_MS
  return events.filter((e) => new Date(e.at).getTime() > threshold)
}
