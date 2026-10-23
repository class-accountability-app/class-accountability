'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult, type ErrorKey } from '@/lib/errors'
import { POLL_TITLE_MAX, checkSlots, isPollAnswer, type SlotProblem } from '@/lib/meeting-poll'

// Meeting polls (0024). Creating, confirming and cancelling go through the
// database's functions; an answer is my own row, allowed while the poll is open.

const SLOT_ERRORS: Record<SlotProblem, ErrorKey> = {
  tooFew: 'pollTimesTooFew',
  tooMany: 'pollTimesTooMany',
  invalid: 'pollTimeInvalid',
  past: 'pollTimePast',
  duplicate: 'pollTimeDuplicate',
}

function refresh(classId: string, pollId?: string) {
  revalidatePath(`/classes/${classId}/project`)
  revalidatePath(`/classes/${classId}/project/meetings`)
  if (pollId) revalidatePath(`/classes/${classId}/project/meetings/${pollId}`)
}

export async function createPoll(
  classId: string,
  projectId: string,
  input: { title: string; duration: number; voteBy: string | null; slots: { date: string; time: string }[] }
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const title = input.title.trim()
  if (!title) return { error: 'titleRequired' }
  if ([...title].length > POLL_TITLE_MAX) return { error: 'pollTitleTooLong' }
  if (!Number.isInteger(input.duration) || input.duration < 15 || input.duration > 240) return { error: 'generic' }

  const now = new Date()
  const slots = checkSlots(input.slots, now)
  if (!slots.ok) return { error: SLOT_ERRORS[slots.problem] }

  // 回答のしめきり: a Tokyo date and time, typed in a datetime-local field.
  let voteBy: string | null = null
  if (input.voteBy) {
    const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.voteBy) ? new Date(`${input.voteBy}:00+09:00`) : null
    if (!at || Number.isNaN(at.getTime()) || at <= now) return { error: 'voteByPast' }
    voteBy = at.toISOString()
  }

  const { data, error } = await supabase.rpc('create_meeting_poll', {
    p_project: projectId,
    p_title: title,
    p_duration: input.duration,
    p_vote_by: voteBy,
    p_starts: slots.value,
  })
  if (error) {
    return {
      error: toErrorKey('createPoll', error, {
        [DB_CODES.pollTimesInvalid]: 'pollTimePast',
        [DB_CODES.insufficientPrivilege]: 'notAllowed',
      }),
    }
  }

  refresh(classId)
  return { error: null, id: data as string }
}

// ○ / △ / ✕ on one time. Saved as soon as it's tapped (upsert of my own row).
export async function answerPoll(classId: string, pollId: string, optionId: string, answer: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }
  if (!isPollAnswer(answer)) return { error: 'generic' }

  const { error } = await supabase
    .from('meeting_poll_votes')
    .upsert({ option_id: optionId, user_id: user.id, answer }, { onConflict: 'option_id,user_id' })
  if (error) {
    // RLS refuses an answer once the poll is confirmed or cancelled.
    return { error: toErrorKey('answerPoll', error, { [DB_CODES.insufficientPrivilege]: 'pollClosed' }) }
  }

  refresh(classId, pollId)
  return { error: null }
}

export async function confirmPoll(classId: string, pollId: string, optionId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const { error } = await supabase.rpc('confirm_meeting_poll', { p_poll: pollId, p_option: optionId })
  if (error) return { error: toErrorKey('confirmPoll', error, { [DB_CODES.pollClosed]: 'pollClosed' }) }

  refresh(classId, pollId)
  return { error: null }
}

export async function cancelPoll(classId: string, pollId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const { error } = await supabase.rpc('cancel_meeting_poll', { p_poll: pollId })
  if (error) return { error: toErrorKey('cancelPoll', error, { [DB_CODES.pollClosed]: 'pollClosed' }) }

  refresh(classId, pollId)
  return { error: null }
}
