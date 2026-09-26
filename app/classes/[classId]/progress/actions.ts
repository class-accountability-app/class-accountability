'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'

const TARGET_TYPES = ['task', 'word_count', 'study_hours', 'character_count'] as const
type TargetType = (typeof TARGET_TYPES)[number]

const MAX_TEXT_LENGTH = 280

function isTargetType(value: string): value is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(value)
}

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
  return { error: null }
}

export async function logProgress(classId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const targetId = formData.get('target_id')?.toString()
  const progressValueRaw = formData.get('progress_value')?.toString().trim()
  const descriptionRaw = formData.get('description')?.toString().trim()

  if (!targetId) {
    return { error: 'chooseTarget' }
  }

  const progressValue = progressValueRaw ? Number(progressValueRaw) : NaN
  if (!Number.isFinite(progressValue) || progressValue <= 0) {
    return { error: 'progressPositive' }
  }

  const description = descriptionRaw || null
  if (description && description.length > MAX_TEXT_LENGTH) {
    return { error: 'tooLong' }
  }

  const { data, error } = await supabase
    .from('progress_logs')
    .insert({
      user_id: user.id,
      target_id: targetId,
      progress_value: progressValue,
      description,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      error: toErrorKey('logProgress', error, { [DB_CODES.foreignKeyViolation]: 'notOwnTarget' }),
    }
  }

  revalidatePath(`/classes/${classId}/progress`)
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
