'use server'

import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'
import { checkAwayUntil } from '@/lib/away'
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

// お休みを伝える (0049): the last day of my break, or null to clear it. The
// database applies the same limits (today .. 30 days ahead, Tokyo days).
export async function setAway(until: string | null): Promise<ActionResult> {
  let value: string | null = null
  if (until !== null) {
    const checked = checkAwayUntil(until)
    if (!checked.ok) return { error: 'awayDateInvalid' }
    value = checked.value
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_away', { p_until: value })
  if (error) return { error: toErrorKey('setAway', error, { [DB_CODES.checkViolation]: 'awayDateInvalid' }) }
  return { error: null }
}
