import type { TaskMetric, TaskStatus } from '@/lib/tasks'

// What the team board shows for a teammate's task. Teammates never see each
// other's running numbers (0022): only the task row (title, owner, status,
// goal) and, from each member's latest check-in, the numbers they shared.
// Pure functions over rows already allowed by RLS.

export type SnapshotItem = {
  taskId: string
  title: string
  metric: TaskMetric
  unit: string | null
  targetAmount: number | null
  total: number | null
  status: TaskStatus
}

export type CheckinRow = {
  userId: string
  roundStart: string // 'YYYY-MM-DD'
  createdAt: string
  snapshot: unknown // jsonb from submit_checkin(), read defensively
}

export type LatestCheckin = { roundStart: string; items: Map<string, SnapshotItem> }

const toNumber = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function readItem(raw: unknown): SnapshotItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.task_id !== 'string') return null
  return {
    taskId: r.task_id,
    title: typeof r.title === 'string' ? r.title : '',
    metric: r.metric as TaskMetric,
    unit: typeof r.unit === 'string' ? r.unit : null,
    targetAmount: toNumber(r.target_amount),
    total: toNumber(r.total),
    status: r.status as TaskStatus,
  }
}

// One check-in's items in the order they were shared (the feed's bullets).
export function snapshotItems(snapshot: unknown): SnapshotItem[] {
  return (Array.isArray(snapshot) ? snapshot : []).map(readItem).filter((x): x is SnapshotItem => x !== null)
}

// Each member's most recent check-in (latest round, then latest written).
export function latestCheckins(rows: readonly CheckinRow[]): Map<string, LatestCheckin> {
  const best = new Map<string, CheckinRow>()
  for (const row of rows) {
    const current = best.get(row.userId)
    if (
      !current ||
      row.roundStart > current.roundStart ||
      (row.roundStart === current.roundStart && row.createdAt > current.createdAt)
    ) {
      best.set(row.userId, row)
    }
  }
  const result = new Map<string, LatestCheckin>()
  for (const [userId, row] of best) {
    const items = new Map(snapshotItems(row.snapshot).map((item) => [item.taskId, item]))
    result.set(userId, { roundStart: row.roundStart, items })
  }
  return result
}

// The total a viewer may see for a task: live for their own task, the shared
// number from the owner's latest check-in for a teammate's, otherwise none.
export function visibleTotal(
  task: { id: string; ownerId: string | null; metric: TaskMetric },
  viewerId: string,
  liveTotals: ReadonlyMap<string, number>,
  latest: ReadonlyMap<string, LatestCheckin>,
): { total: number | null; asOf: string | null; live: boolean } {
  if (task.metric === 'status') return { total: null, asOf: null, live: false }
  if (task.ownerId === viewerId) return { total: liveTotals.get(task.id) ?? 0, asOf: null, live: true }
  if (task.ownerId === null) return { total: null, asOf: null, live: false }
  const checkin = latest.get(task.ownerId)
  const item = checkin?.items.get(task.id)
  if (!checkin || !item || item.total === null) return { total: null, asOf: null, live: false }
  return { total: item.total, asOf: checkin.roundStart, live: false }
}
