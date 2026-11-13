'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/errors'
import { CURRENT_PROJECT_COOKIE, withCurrentProject } from '@/lib/current-project'

// The board's project switcher (2026-11-13): remember, in this browser, which
// of the team's active projects the project pages show. Only a project the
// student can read (RLS: their own team's) and that is active is accepted, so
// the cookie can't be pointed at anything else.
export async function chooseProject(classId: string, projectId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const { data: project } = await supabase
    .from('projects')
    .select('id, pairings!inner(class_id)')
    .eq('id', projectId)
    .eq('status', 'active')
    .eq('pairings.class_id', classId)
    .maybeSingle()
  if (!project) return { error: 'notAllowed' }

  const jar = await cookies()
  jar.set(CURRENT_PROJECT_COOKIE, withCurrentProject(jar.get(CURRENT_PROJECT_COOKIE)?.value, classId, projectId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
  revalidatePath(`/classes/${classId}/project`, 'layout')
  revalidatePath('/')
  return { error: null }
}
