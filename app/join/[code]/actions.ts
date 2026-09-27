'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'

// このクラスに参加する on screen 04. join_class_by_code (0013) is the only
// way into a class: it finds the class by the code and adds the student, so
// the button can only join the class the link was for. Already a member is a
// success. On success it goes straight to the class page.
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
  const { data: classId, error } = await supabase.rpc('join_class_by_code', { code })

  if (error) {
    return { error: toErrorKey('joinClassByCode', error) }
  }
  if (!classId) {
    return { error: 'joinCodeInvalid' }
  }

  revalidatePath('/', 'layout')
  redirect(`/classes/${classId}`)
}
