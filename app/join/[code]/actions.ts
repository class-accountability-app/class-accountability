'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/errors'
import { joinClassAndGo } from '@/lib/join-class'

// このクラスに参加する on screen 04. The button can only join the class the
// link was for. A student's first class goes on to the pod step; anyone else
// to the class page (lib/join-class.ts).
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

  return joinClassAndGo(supabase, user.id, formData.get('code')?.toString() ?? '')
}
