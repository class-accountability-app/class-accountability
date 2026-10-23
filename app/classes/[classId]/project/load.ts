import type { getTranslations } from 'next-intl/server'
import type { createClient } from '@/lib/supabase/server'
import { tidyTotal } from '@/lib/quick-log'
import type { TaskMetric, TaskStatus } from '@/lib/tasks'

type Supabase = Awaited<ReturnType<typeof createClient>>
export type ProjectT = Awaited<ReturnType<typeof getTranslations<'project'>>>

export type ProjectRow = {
  id: string
  title: string
  start_date: string
  deadline: string | null
  checkin_every_days: number
}

export type TaskRow = {
  id: string
  title: string
  owner_id: string | null
  metric: TaskMetric
  unit: string | null
  target_amount: number | string | null
  status: TaskStatus
  due: string | null
}

// My active pod in this class, its project (if started) and its members, in
// join order. RLS lets pod members read all of it.
export async function loadMyPodProject(supabase: Supabase, classId: string, userId: string, unknownName: string) {
  const { data: myPod } = await supabase
    .from('pairing_members')
    .select('pairing_id, pairings!inner(class_id, status)')
    .eq('user_id', userId)
    .eq('pairings.class_id', classId)
    .eq('pairings.status', 'active')
    .limit(1)
    .maybeSingle()
  if (!myPod) return null

  const [{ data: project }, { data: memberRows }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, title, start_date, deadline, checkin_every_days')
      .eq('pairing_id', myPod.pairing_id)
      .maybeSingle(),
    supabase
      .from('pairing_members')
      .select('user_id, joined_at, profiles(display_name)')
      .eq('pairing_id', myPod.pairing_id)
      .order('joined_at'),
  ])

  const members = (memberRows ?? []).map((m) => ({
    id: m.user_id,
    name: (m.profiles as unknown as { display_name: string } | null)?.display_name ?? unknownName,
  }))
  return { podId: myPod.pairing_id, project: (project as ProjectRow | null) ?? null, members }
}

// Live totals for my own counted tasks. RLS returns only entries I logged or
// on tasks I own, so nothing here can be a teammate's running number.
export async function loadMyLiveTotals(supabase: Supabase, tasks: readonly TaskRow[], userId: string) {
  const ids = tasks.filter((x) => x.owner_id === userId && x.metric !== 'status').map((x) => x.id)
  const totals = new Map<string, number>()
  if (ids.length === 0) return totals
  const { data } = await supabase.from('task_progress').select('task_id, progress_value').in('task_id', ids)
  for (const e of data ?? []) totals.set(e.task_id, tidyTotal((totals.get(e.task_id) ?? 0) + Number(e.progress_value)))
  return totals
}

// The status pill of a task the viewer can't change (a teammate's, or in a
// check-in): the mockup's .pill.todo / .doing / .done.
export const STATUS_PILL_CLASS: Record<TaskStatus, string> = {
  todo: 'text-status-stale shadow-[inset_0_0_0_1px_var(--color-border)]',
  doing: 'text-status-active shadow-[inset_0_0_0_1px_var(--color-status-active)]',
  done: 'bg-status-active text-white',
}

// 「1,600 / 2,400字」「6 / 10枚」, or null for a status task or no number.
export function taskValueText(
  t: ProjectT,
  number: Intl.NumberFormat,
  task: { metric: TaskMetric; unit: string | null; targetAmount: number | null },
  total: number | null,
): string | null {
  if (task.metric === 'status' || total === null) return null
  const shown = number.format(total)
  if (task.metric === 'characters') {
    return task.targetAmount === null
      ? t('valueCharsNoGoal', { total: shown })
      : t('valueChars', { total: shown, target: number.format(task.targetAmount) })
  }
  return task.targetAmount === null
    ? t('valueCountNoGoal', { total: shown, unit: task.unit ?? '' })
    : t('valueCount', { total: shown, target: number.format(task.targetAmount), unit: task.unit ?? '' })
}
