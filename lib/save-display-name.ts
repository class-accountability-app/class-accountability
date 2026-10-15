import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'
import { normalizeDisplayName } from '@/lib/display-name'

// Only display_name is sent: the database lets a client change nothing else
// on profiles, and a trigger stamps name_chosen_at (0011). Shared by 設定's
// save-and-stay and the welcome screen's save-and-carry-on.
export async function saveDisplayName(context: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const name = normalizeDisplayName(formData.get('display_name'))
  if (name.error) {
    return { error: name.error }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: name.value })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return { error: toErrorKey(context, error) }
  }

  // The name shows on every page (pods, progress, comments, nudges).
  revalidatePath('/', 'layout')
  return { error: null }
}
