import type { createClient } from '@/lib/supabase/server'
import type { TargetType } from '@/lib/targets'
import type { MyLog, QuickTarget } from './quick-log-provider'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type MyTargetRow = {
  id: string
  class_id: string
  title: string
  target_type: TargetType
  target_amount: number | null
  deadline: string | null
  created_at: string
  classes: { name: string } | null
}

type LogRow = {
  id: string
  client_id: string | null
  target_id: string
  progress_value: number
  description: string | null
  logged_at: string
  progress_comments: { count: number }[]
}

// My targets (in one class, or all of them for Home), all my logs on them
// with their comment counts (for the delete warning), and whether I'm in a
// pod in each target's class (for ポッドに共有されました). RLS limits every
// read to what I may see; the user_id filters say what the page wants.
// Home already reads my pods, so it passes their classes in (podClasses)
// instead of this function asking again.
export async function loadMyTargets(
  supabase: Supabase,
  userId: string,
  { classId, podClasses }: { classId?: string; podClasses?: Promise<Set<string>> } = {}
) {
  let query = supabase
    .from('targets')
    .select('id, class_id, title, target_type, target_amount, deadline, created_at, classes(name)')
    .eq('user_id', userId)
    .order('created_at')
  if (classId) query = query.eq('class_id', classId)
  const { data: targetData } = await query
  const rows = (targetData as MyTargetRow[] | null) ?? []
  const ids = rows.map((r) => r.id)

  const [{ data: logData }, inPodClasses] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('progress_logs')
          .select('id, client_id, target_id, progress_value, description, logged_at, progress_comments(count)')
          .eq('user_id', userId)
          .in('target_id', ids)
          .order('logged_at', { ascending: false })
      : Promise.resolve({ data: [] as LogRow[] }),
    podClasses ??
      supabase
        .from('pairing_members')
        .select('pairings!inner(class_id, status)')
        .eq('user_id', userId)
        .eq('pairings.status', 'active')
        .then(
          ({ data }) =>
            new Set(
              ((data as { pairings: { class_id: string } | null }[] | null) ?? []).flatMap((p) =>
                p.pairings ? [p.pairings.class_id] : []
              )
            )
        ),
  ])

  const targets: QuickTarget[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.target_type,
    targetAmount: r.target_amount === null ? null : Number(r.target_amount),
    deadline: r.deadline,
    className: r.classes?.name ?? '',
    inPod: inPodClasses.has(r.class_id),
  }))

  const logs: MyLog[] = ((logData as LogRow[] | null) ?? []).map((l) => ({
    id: l.id,
    clientId: l.client_id,
    targetId: l.target_id,
    value: Number(l.progress_value),
    description: l.description,
    loggedAt: l.logged_at,
    commentCount: l.progress_comments?.[0]?.count ?? 0,
  }))

  return { rows, targets, logs }
}
