'use server'

import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'
import { saveDisplayName } from '@/lib/save-display-name'

// Settings (13): save and stay. (The welcome screen's save is in
// app/welcome/actions.ts.)
export async function updateDisplayName(formData: FormData): Promise<ActionResult> {
  return saveDisplayName('updateDisplayName', formData)
}

// オンライン表示 (0035): whether teammates see my live dot.
export async function setOnlineSharing(on: boolean): Promise<ActionResult> {
  if (typeof on !== 'boolean') return { error: 'generic' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_online_sharing', { p_share: on })
  if (error) return { error: toErrorKey('setOnlineSharing', error) }
  return { error: null }
}
