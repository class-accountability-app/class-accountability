'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/errors'
import { safeNextPath } from '@/lib/auth/next-path'
import { joinCodeFromNext } from '@/lib/first-run'
import { joinClassAndGo } from '@/lib/join-class'
import { saveDisplayName } from '@/lib/save-display-name'

// Welcome (03): save the name, then carry on to the page the student was
// heading for. When that page is a class invitation (/join/{code}), joining
// happens in the same step (「この名前で参加する」); the invitation page's own
// copy ("people in this class will see your name") is shown on this screen.
// If the join then fails, /join/{code} says why, so it is never a dead end.
export async function chooseNameAndJoin(formData: FormData): Promise<ActionResult> {
  const result = await saveDisplayName('chooseNameAndJoin', formData)
  if (result.error) return result

  const next = safeNextPath(formData.get('next')?.toString())
  const code = joinCodeFromNext(next)
  if (!code) redirect(next)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await joinClassAndGo(supabase, user.id, code) // redirects on success
  redirect(next)
}
