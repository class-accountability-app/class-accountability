'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult, type ErrorKey } from '@/lib/errors'
import { isTargetType, type TargetType } from '@/lib/targets'
import { parseAmount } from '@/lib/quick-log'

const MAX_TEXT_LENGTH = 280

export async function createTarget(classId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const title = formData.get('title')?.toString().trim()
  const targetType = formData.get('target_type')?.toString()
  const targetAmountRaw = formData.get('target_amount')?.toString().trim()
  const deadlineRaw = formData.get('deadline')?.toString().trim()

  if (!title) {
    return { error: 'titleRequired' }
  }

  if (!targetType || !isTargetType(targetType)) {
    return { error: 'invalidTargetType' }
  }

  let targetAmount: number | null = null
  if (targetType !== 'task') {
    const parsed = targetAmountRaw ? Number(targetAmountRaw) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: 'targetAmountPositive' }
    }
    targetAmount = parsed
  }

  const deadline = deadlineRaw || null

  // Targets belong to a class you study in. The insert policy enforces it
  // (0013, 0015); this check only gives a clear message instead of "not allowed".
  const { data: membership, error: membershipError } = await supabase
    .from('class_memberships')
    .select('role')
    .eq('class_id', classId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return { error: toErrorKey('createTarget.membership', membershipError) }
  }
  if (!membership) {
    return { error: 'targetClassNotJoined' }
  }
  if (membership.role === 'organizer') {
    return { error: 'organizerNoTargets' }
  }

  const { data, error } = await supabase
    .from('targets')
    .insert({
      user_id: user.id,
      class_id: classId,
      title,
      target_type: targetType,
      target_amount: targetAmount,
      deadline,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: toErrorKey('createTarget', error) }
  }

  revalidatePath(`/classes/${classId}/progress`)
  revalidatePath('/') // Home's targets and 次にやること
  return { error: null }
}

// Quick log (screen 10). What the sheet sends; `amount` is what the student
// typed, parsed here with the same rules as in the sheet. A task has no
// amount: its one log means 完了 (value 1).
export type LogInput = {
  amount: string
  description: string
}

type LogResult = ActionResult & { id?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type OwnTarget = { id: string; class_id: string; target_type: TargetType }

// The value to store, or the error key for the field.
function valueFor(
  target: OwnTarget,
  input: LogInput
): { value: number; description: string | null } | { error: ErrorKey } {
  const description = input.description.trim() || null
  if (description && description.length > MAX_TEXT_LENGTH) return { error: 'tooLong' }
  if (target.target_type === 'task') return { value: 1, description }
  const value = parseAmount(input.amount, target.target_type)
  if (value === null) {
    return { error: target.target_type === 'study_hours' ? 'logHoursInvalid' : 'logAmountInvalid' }
  }
  return { value, description }
}

function revalidateLogPages(classId: string) {
  revalidatePath(`/classes/${classId}/progress`)
  revalidatePath('/') // Home's あなたの目標
}

// clientId is made once per opened sheet. A second tap, or a retry after a
// network failure, sends the same one: the unique (user_id, client_id)
// constraint (0014) stops a second row, and that counts as saved.
export async function logProgress(
  targetId: string,
  clientId: string,
  input: LogInput
): Promise<LogResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }
  if (!UUID.test(clientId)) {
    return { error: 'generic' }
  }

  // RLS shows me my own targets; anyone else's comes back empty.
  const { data: target } = await supabase
    .from('targets')
    .select('id, class_id, target_type')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .maybeSingle<OwnTarget>()

  if (!target) {
    return { error: 'notOwnTarget' }
  }

  const parsed = valueFor(target, input)
  if ('error' in parsed) {
    return { error: parsed.error }
  }

  const { data, error } = await supabase
    .from('progress_logs')
    .insert({
      user_id: user.id,
      target_id: target.id,
      progress_value: parsed.value,
      description: parsed.description,
      client_id: clientId,
    })
    .select('id')
    .single()

  if (error?.code === DB_CODES.uniqueViolation) {
    const { data: existing } = await supabase
      .from('progress_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle()
    if (existing) {
      return { error: null, id: existing.id }
    }
  }

  if (error || !data) {
    return {
      error: toErrorKey('logProgress', error, { [DB_CODES.foreignKeyViolation]: 'notOwnTarget' }),
    }
  }

  revalidateLogPages(target.class_id)
  return { error: null, id: data.id }
}

type OwnLog = { id: string; targets: OwnTarget | null }

// 編集 on あなたの最近の記録: the amount and the memo. A task's 完了 log
// keeps its value; only the memo changes. The database refuses anything else
// (keep_progress_log_identity, 0014).
export async function updateLog(logId: string, input: LogInput): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data: log } = await supabase
    .from('progress_logs')
    // Two foreign keys point at targets (target_id, and 0009's owner check),
    // so name the one to follow.
    .select('id, targets!progress_logs_target_id_fkey(id, class_id, target_type)')
    .eq('id', logId)
    .eq('user_id', user.id)
    .maybeSingle<OwnLog>()

  if (!log?.targets) {
    return { error: 'logNotFound' }
  }

  const parsed = valueFor(log.targets, input)
  if ('error' in parsed) {
    return { error: parsed.error }
  }

  const { data, error } = await supabase
    .from('progress_logs')
    .update({ progress_value: parsed.value, description: parsed.description })
    .eq('id', log.id)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    return { error: toErrorKey('updateLog', error) }
  }
  if (!data || data.length === 0) {
    return { error: 'logNotFound' }
  }

  revalidateLogPages(log.targets.class_id)
  return { error: null }
}

// 削除 on あなたの最近の記録, and 取り消す in the toast. Comments on the log
// go with it (on delete cascade, 0008); the confirm step says so.
export async function deleteLog(logId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data, error } = await supabase
    .from('progress_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', user.id)
    .select('id, targets!progress_logs_target_id_fkey(class_id)')

  if (error) {
    return { error: toErrorKey('deleteLog', error) }
  }
  const deleted = (data ?? []) as unknown as { targets: { class_id: string } | null }[]
  if (deleted.length === 0) {
    return { error: 'logNotFound' }
  }

  const classId = deleted[0].targets?.class_id
  if (classId) revalidateLogPages(classId)
  else revalidatePath('/', 'layout')
  return { error: null }
}

export async function addComment(
  classId: string,
  progressLogId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const body = formData.get('body')?.toString().trim()

  if (!body) {
    return { error: 'commentEmpty' }
  }

  if (body.length > MAX_TEXT_LENGTH) {
    return { error: 'tooLong' }
  }

  const { data, error } = await supabase
    .from('progress_comments')
    .insert({
      progress_log_id: progressLogId,
      author_id: user.id,
      body,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: toErrorKey('addComment', error) }
  }

  revalidatePath(`/classes/${classId}/progress`)
  return { error: null }
}

// Keep in sync with the "3 times in 24 hours" wording of errors.nudgeLimit.
const NUDGE_DAILY_LIMIT = 3

export async function sendNudge(
  podId: string,
  toUserId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const content = formData.get('content')?.toString().trim()

  if (!content) {
    return { error: 'nudgeEmpty' }
  }

  if (content.length > MAX_TEXT_LENGTH) {
    return { error: 'tooLong' }
  }

  const rollingWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('nudges')
    .select('id', { count: 'exact', head: true })
    .eq('from_user_id', user.id)
    .eq('to_user_id', toUserId)
    .gte('created_at', rollingWindowStart)

  if ((count ?? 0) >= NUDGE_DAILY_LIMIT) {
    return { error: 'nudgeLimit' }
  }

  const { data, error } = await supabase
    .from('nudges')
    .insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      pairing_id: podId,
      type: 'question_prompt',
      content,
    })
    .select('id')
    .single()

  if (error || !data) {
    // The database enforces the same limit (0011), so a request that races
    // past the count above still gets the friendly message.
    const key = toErrorKey('sendNudge', error, { [DB_CODES.nudgeLimit]: 'nudgeLimit' })
    return { error: key === 'nudgeLimit' ? key : 'nudgeFailed' }
  }

  const { data: pairing } = await supabase
    .from('pairings')
    .select('class_id')
    .eq('id', podId)
    .single()

  if (pairing) {
    revalidatePath(`/classes/${pairing.class_id}/progress`)
  }

  return { error: null }
}

export async function deleteComment(classId: string, commentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { error } = await supabase.from('progress_comments').delete().eq('id', commentId)

  if (error) {
    return { error: toErrorKey('deleteComment', error) }
  }

  revalidatePath(`/classes/${classId}/progress`)
  return { error: null }
}
