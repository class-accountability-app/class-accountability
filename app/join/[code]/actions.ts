'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, logServerError, toErrorKey, type ActionResult } from '@/lib/errors'

// このクラスに参加する on screen 04. The class comes from the code again,
// not from an id the browser sends, so the button can only join the class
// the link was for. On success it goes straight to the class page.
export async function joinClassByCode(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const code = formData.get('code')?.toString() ?? ''
  const { data: found, error: lookupError } = await supabase
    .rpc('class_by_join_code', { code })
    .maybeSingle<{ id: string }>()

  if (lookupError || !found) {
    if (lookupError) logServerError('joinClassByCode.lookup', lookupError)
    return { error: 'joinCodeInvalid' }
  }

  const { error } = await supabase
    .from('class_memberships')
    .insert({ user_id: user.id, class_id: found.id })

  // Already a member (e.g. pressed twice, or joined in another tab): fine.
  if (error && error.code !== DB_CODES.uniqueViolation) {
    return { error: toErrorKey('joinClassByCode', error) }
  }

  revalidatePath('/', 'layout')
  redirect(`/classes/${found.id}`)
}
