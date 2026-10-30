'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'

const MAX_TEXT_LENGTH = 280
// The database enforces the same limit (0011); this only answers early.
const NUDGE_DAILY_LIMIT = 3

// 声をかける on the project board (moved from the old team-progress page when
// personal targets were removed, 0032). The nudge goes to a teammate in this
// team; 0011's trigger keeps it to 3 per sender → recipient in 24 hours, and
// 0018 sends the push.
export async function sendNudge(podId: string, toUserId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const content = formData.get('content')?.toString().trim()
  if (!content) return { error: 'nudgeEmpty' }
  if (content.length > MAX_TEXT_LENGTH) return { error: 'tooLong' }

  const rollingWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('nudges')
    .select('id', { count: 'exact', head: true })
    .eq('from_user_id', user.id)
    .eq('to_user_id', toUserId)
    .gte('created_at', rollingWindowStart)
  if ((count ?? 0) >= NUDGE_DAILY_LIMIT) return { error: 'nudgeLimit' }

  const { data, error } = await supabase
    .from('nudges')
    .insert({ from_user_id: user.id, to_user_id: toUserId, pairing_id: podId, type: 'question_prompt', content })
    .select('id')
    .single()
  if (error || !data) {
    const key = toErrorKey('sendNudge', error, { [DB_CODES.nudgeLimit]: 'nudgeLimit' })
    return { error: key === 'nudgeLimit' ? key : 'nudgeFailed' }
  }

  const { data: pairing } = await supabase.from('pairings').select('class_id').eq('id', podId).single()
  if (pairing) revalidatePath(`/classes/${pairing.class_id}/project`)
  return { error: null }
}
