'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const FOREIGN_KEY_VIOLATION = '23503'

const TARGET_TYPES = ['task', 'word_count', 'study_hours'] as const
type TargetType = (typeof TARGET_TYPES)[number]

function isTargetType(value: string): value is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(value)
}

export async function createTarget(classId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const title = formData.get('title')?.toString().trim()
  const targetType = formData.get('target_type')?.toString()
  const targetAmountRaw = formData.get('target_amount')?.toString().trim()
  const deadlineRaw = formData.get('deadline')?.toString().trim()

  if (!title) {
    return { error: 'Title is required.' }
  }

  if (!targetType || !isTargetType(targetType)) {
    return { error: 'Choose a valid target type.' }
  }

  let targetAmount: number | null = null
  if (targetType !== 'task') {
    const parsed = targetAmountRaw ? Number(targetAmountRaw) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: 'Target amount must be a positive number.' }
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
    return { error: error?.message ?? 'Could not create target.' }
  }

  revalidatePath(`/classes/${classId}/progress`)
  return { error: null }
}

export async function logProgress(classId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const targetId = formData.get('target_id')?.toString()
  const progressValueRaw = formData.get('progress_value')?.toString().trim()
  const descriptionRaw = formData.get('description')?.toString().trim()

  if (!targetId) {
    return { error: 'Choose a target.' }
  }

  const progressValue = progressValueRaw ? Number(progressValueRaw) : NaN
  if (!Number.isFinite(progressValue) || progressValue <= 0) {
    return { error: 'Progress value must be a positive number.' }
  }

  const description = descriptionRaw || null
  if (description && description.length > 280) {
    return { error: 'Description must be 280 characters or fewer.' }
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
    if (error?.code === FOREIGN_KEY_VIOLATION) {
      return { error: 'You can only log progress against your own targets.' }
    }
    return { error: error?.message ?? 'Could not log progress.' }
  }

  revalidatePath(`/classes/${classId}/progress`)
  return { error: null }
}

export async function addComment(classId: string, progressLogId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const body = formData.get('body')?.toString().trim()

  if (!body) {
    return { error: 'Comment cannot be empty.' }
  }

  if (body.length > 280) {
    return { error: 'Comment must be 280 characters or fewer.' }
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
    return { error: error?.message ?? "Couldn't post that comment." }
  }

  revalidatePath(`/classes/${classId}/progress`)
  return { error: null }
}

const NUDGE_DAILY_LIMIT = 3

export async function sendNudge(podId: string, toUserId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const content = formData.get('content')?.toString().trim()

  if (!content) {
    return { error: "Say something before sending — the box can't be empty." }
  }

  if (content.length > 280) {
    return { error: 'Keep it to 280 characters or fewer.' }
  }

  const rollingWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('nudges')
    .select('id', { count: 'exact', head: true })
    .eq('from_user_id', user.id)
    .eq('to_user_id', toUserId)
    .gte('created_at', rollingWindowStart)

  if ((count ?? 0) >= NUDGE_DAILY_LIMIT) {
    return { error: "You've already nudged them a few times today — give it a bit." }
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
    return { error: "Couldn't send that nudge — make sure you're still podmates." }
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

export async function deleteComment(classId: string, commentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { error } = await supabase.from('progress_comments').delete().eq('id', commentId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/classes/${classId}/progress`)
  return { error: null }
}
