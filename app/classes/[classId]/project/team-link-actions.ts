'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult, type ErrorKey } from '@/lib/errors'
import { checkTeamLink, type TeamLinkProblem } from '@/lib/team-links'

// チームのリンク (0043). Both run as the signed-in student: RLS decides who may
// add to or remove from a project's links, and the database re-checks the
// address, so nothing here is the security.

const PROBLEM_ERRORS: Record<TeamLinkProblem, ErrorKey> = {
  titleRequired: 'linkTitleRequired',
  titleTooLong: 'linkTitleTooLong',
  urlRequired: 'linkUrlRequired',
  urlInvalid: 'linkUrlInvalid',
}

export async function addTeamLink(classId: string, projectId: string, input: { title: string; url: string }): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const checked = checkTeamLink(input)
  if (!checked.ok) return { error: PROBLEM_ERRORS[checked.problem] }

  const { error } = await supabase.from('project_links').insert({ project_id: projectId, title: checked.value.title, url: checked.value.url })
  if (error) {
    return {
      error: toErrorKey('addTeamLink', error, {
        [DB_CODES.teamLinksFull]: 'linksFull',
        [DB_CODES.checkViolation]: 'linkUrlInvalid',
        [DB_CODES.insufficientPrivilege]: 'notAllowed',
      }),
    }
  }
  revalidatePath(`/classes/${classId}/project`)
  return { error: null }
}

export async function removeTeamLink(classId: string, linkId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const { data, error } = await supabase.from('project_links').delete().eq('id', linkId).select('id')
  if (error) return { error: toErrorKey('removeTeamLink', error) }
  // Nothing removed: it was already gone, or the project is finished.
  if (!data || data.length === 0) return { error: 'notAllowed' }
  revalidatePath(`/classes/${classId}/project`)
  return { error: null }
}
