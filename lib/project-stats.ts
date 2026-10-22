import { tokyoDaysUntil } from '@/lib/date'
import type { TaskMetric, TaskStatus } from '@/lib/tasks'

// The numbers on the team board. Pure functions, like progress-stats.ts.
// `total` is the sum of a task's progress entries (summed on read, never
// stored); for a status task it is 0 and unused.

export type TaskLike = {
  id: string
  ownerId: string | null
  metric: TaskMetric
  targetAmount: number | null
  status: TaskStatus
  total: number
  due: string | null // 'YYYY-MM-DD'
}

// How far along a task is, 0..1. Done is done. Otherwise a counted task is its
// total over its goal (capped at 1); a task with no goal, or a status-only
// task, is 0 when not started and half when under way.
export function taskFraction(task: TaskLike): number {
  if (task.status === 'done') return 1
  if (task.metric !== 'status' && task.targetAmount !== null) {
    return Math.min(Math.max(task.total / task.targetAmount, 0), 1)
  }
  return task.status === 'doing' ? 0.5 : 0
}

export function taskPercent(task: TaskLike): number {
  return Math.round(taskFraction(task) * 100)
}

// Finished: marked done, or the counted goal has been reached.
export function isTaskFinished(task: TaskLike): boolean {
  if (task.status === 'done') return true
  return task.metric !== 'status' && task.targetAmount !== null && task.total >= task.targetAmount
}

// The whole project: every task weighs the same. No tasks is 0%.
export function projectPercent(tasks: readonly TaskLike[]): number {
  if (tasks.length === 0) return 0
  const sum = tasks.reduce((acc, t) => acc + taskFraction(t), 0)
  return Math.round((sum / tasks.length) * 100)
}

// Past its due date and not finished. A task due today is not overdue yet.
export function isOverdue(task: TaskLike, now: Date): boolean {
  return task.due !== null && tokyoDaysUntil(task.due, now) < 0 && !isTaskFinished(task)
}

export type TaskGroup<T extends TaskLike> = { ownerId: string | null; tasks: T[] }

// Tasks grouped for the board: the viewer first, then the other members in the
// order given, then the tasks nobody has taken. A member with no tasks still
// gets a (empty) group so the board shows everyone.
export function groupTasksByOwner<T extends TaskLike>(
  tasks: readonly T[],
  memberIds: readonly string[],
  viewerId: string,
): TaskGroup<T>[] {
  const order = [viewerId, ...memberIds.filter((id) => id !== viewerId)]
  const groups: TaskGroup<T>[] = order.map((ownerId) => ({
    ownerId,
    tasks: tasks.filter((t) => t.ownerId === ownerId),
  }))
  const unassigned = tasks.filter((t) => t.ownerId === null || !order.includes(t.ownerId))
  if (unassigned.length > 0) groups.push({ ownerId: null, tasks: unassigned })
  return groups
}
