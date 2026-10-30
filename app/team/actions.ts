'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'

// このチームに参加する on /team/{code} (0028): join_pod_by_code joins the
// pod, and the class first if needed. Then on to the team's project.
export async function joinTeamByCode(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const code = formData.get('code')?.toString() ?? ''
  const { data: podId, error } = await supabase.rpc('join_pod_by_code', { code })
  if (error || typeof podId !== 'string') {
    return {
      error: toErrorKey('joinTeamByCode', error ?? { message: 'no pod id' }, {
        [DB_CODES.teamFull]: 'podFull',
        [DB_CODES.teamCodeUnknown]: 'teamCodeInvalid',
        [DB_CODES.onePodPerClass]: 'alreadyInPod',
        [DB_CODES.organizerNoPod]: 'organizerNoPod',
      }),
    }
  }

  const { data: pod } = await supabase.from('pairings').select('class_id').eq('id', podId).maybeSingle()
  if (!pod) return { error: 'generic' }
  revalidatePath('/', 'layout')
  redirect(`/classes/${pod.class_id}/project`)
}

// 新しいコードにする: the old code and QR stop working at once.
export async function renewTeamCode(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const podId = formData.get('podId')?.toString() ?? ''
  const classId = formData.get('classId')?.toString() ?? ''
  const { error } = await supabase.rpc('new_pod_join_code', { target_pod: podId })
  if (error) return { error: toErrorKey('renewTeamCode', error) }
  revalidatePath(`/classes/${classId}/project`)
  return { error: null }
}
