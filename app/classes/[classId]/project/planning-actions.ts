'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'
import { MEETING_NOTE_MAX } from '@/lib/planning'

// Planning tools on the team's side (0038): task order and meeting notes. RLS
// lets any team member do both; the database refuses loops (SP018) and changes
// to a finished project (SP016).

const PLANNING_ERRORS = {
  [DB_CODES.planningInvalid]: 'dependencyInvalid',
  [DB_CODES.uniqueViolation]: 'dependencyInvalid',
  [DB_CODES.projectFinished]: 'projectFinished',
  [DB_CODES.insufficientPrivilege]: 'notAllowed',
} as const

export async function addDependency(classId: string, taskId: string, dependsOn: string): Promise<ActionResult> {
  if (taskId === dependsOn) return { error: 'dependencyInvalid' }
  const supabase = await createClient()
  const { error } = await supabase.from('task_dependencies').insert({ task_id: taskId, depends_on: dependsOn })
  if (error) return { error: toErrorKey('addDependency', error, PLANNING_ERRORS) }
  revalidatePath(`/classes/${classId}/project`)
  return { error: null }
}

export async function removeDependency(classId: string, taskId: string, dependsOn: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('task_dependencies').delete().eq('task_id', taskId).eq('depends_on', dependsOn)
  if (error) return { error: toErrorKey('removeDependency', error, PLANNING_ERRORS) }
  revalidatePath(`/classes/${classId}/project`)
  return { error: null }
}

export async function saveMeetingNote(classId: string, pollId: string, body: string): Promise<ActionResult> {
  if ([...body].length > MEETING_NOTE_MAX) return { error: 'meetingNoteTooLong' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }
  const { error } = await supabase
    .from('meeting_notes')
    .upsert({ poll_id: pollId, body, updated_by: user.id }, { onConflict: 'poll_id' })
  if (error) return { error: toErrorKey('saveMeetingNote', error, PLANNING_ERRORS) }
  revalidatePath(`/classes/${classId}/project/meetings/${pollId}`)
  return { error: null }
}
