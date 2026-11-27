// 目標に届きました (0054): when a task reaches its target it turns done on its
// own, and the student who got it there sees one short celebration. The
// celebration lives in the root layout (components/project/done-celebration),
// because the ＋記録 form disappears as soon as its task is done; the form and
// the editor only send this event.

export const TASK_DONE_EVENT = 'sp:task-done'

export type TaskDoneDetail = { title: string }

// Did this step cross the target? Only the crossing counts, so a task already
// over its target (or without one) never celebrates again.
export function reachedTarget(before: number, after: number, target: number | null): boolean {
  if (target === null || !(target > 0)) return false
  return before < target && after >= target
}

export function celebrateTaskDone(title: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<TaskDoneDetail>(TASK_DONE_EVENT, { detail: { title } }))
}
