import { daysBetweenYmd } from './date'

// The task timeline (feature batch 1): one bar per task with a due date, from
// the project's start to the due day, on a scale from the start to the
// project's deadline (or the latest due date). Pure, so it is tested.

export type TimelineTask = { id: string; title: string; due: string | null; status: string }
export type TimelineRow = {
  id: string
  title: string
  due: string
  startPct: number // always 0: every task runs from the project's start
  endPct: number // where the due day falls, 0–100
  late: boolean // due before today and not done
  done: boolean
}

export function timelineRows(
  tasks: readonly TimelineTask[],
  projectStart: string,
  deadline: string | null,
  today: string
): { rows: TimelineRow[]; todayPct: number | null } {
  const dated = tasks.filter((t): t is TimelineTask & { due: string } => t.due !== null)
  if (dated.length === 0) return { rows: [], todayPct: null }
  const end = [deadline, ...dated.map((t) => t.due)].filter((d): d is string => d !== null).sort().at(-1)!
  const span = Math.max(1, daysBetweenYmd(projectStart, end))
  const pct = (ymd: string) => Math.min(100, Math.max(0, Math.round((daysBetweenYmd(projectStart, ymd) / span) * 100)))
  const rows = [...dated]
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
    .map((t) => ({
      id: t.id,
      title: t.title,
      due: t.due,
      startPct: 0,
      endPct: Math.max(2, pct(t.due)),
      done: t.status === 'done',
      late: t.status !== 'done' && t.due < today,
    }))
  const todayPct = today < projectStart || today > end ? null : pct(today)
  return { rows, todayPct }
}
