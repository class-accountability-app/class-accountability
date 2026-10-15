'use server'

import type { ActionResult } from '@/lib/errors'
import { saveDisplayName } from '@/lib/save-display-name'

// Settings (13): save and stay. (The welcome screen's save is in
// app/welcome/actions.ts.)
export async function updateDisplayName(formData: FormData): Promise<ActionResult> {
  return saveDisplayName('updateDisplayName', formData)
}
