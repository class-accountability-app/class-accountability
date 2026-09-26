'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'
import { normalizeDisplayName } from '@/lib/display-name'
import { safeNextPath } from '@/lib/auth/next-path'

// Only display_name is sent: the database lets a client change nothing else
// on profiles, and a trigger stamps name_chosen_at (0011).
async function saveDisplayName(context: string, formData: FormData): Promise<ActionResult> {
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

// Settings (13): save and stay.
export async function updateDisplayName(formData: FormData): Promise<ActionResult> {
  return saveDisplayName('updateDisplayName', formData)
}

// Welcome (03): save, then carry on to the page the student was heading to.
export async function chooseDisplayName(formData: FormData): Promise<ActionResult> {
  const result = await saveDisplayName('chooseDisplayName', formData)
  if (result.error) return result
  redirect(safeNextPath(formData.get('next')?.toString()))
}
