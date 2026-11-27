'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'
import { ANNOUNCEMENT_MAX, TEAM_NAME_MAX } from '@/lib/organizer'
import { isAutoSplitSize, isTeamSizeLimit } from '@/lib/team-size'
import { loadTeamLimit } from './team-limit'
import { isMilestoneInput } from '@/lib/planning'

// The organizer's team tools (0036). The database checks that the caller is
// this class's organizer and keeps every team rule (students only, one team
// per class, at most the class's team size limit, 0053); these only turn
// common mistakes into clear messages.

const TEAM_ERRORS = {
  [DB_CODES.teamFull]: 'podFull',
  [DB_CODES.onePodPerClass]: 'alreadyInPod',
  [DB_CODES.organizerNoPod]: 'organizerNoPod',
  [DB_CODES.teamSetupInvalid]: 'teamSetupInvalid',
  [DB_CODES.insufficientPrivilege]: 'notAllowed',
} as const

function refresh(classId: string) {
  revalidatePath(`/classes/${classId}`)
  revalidatePath(`/classes/${classId}/project`)
}

const nameOk = (name: string) => [...name.trim()].length <= TEAM_NAME_MAX

export async function createTeam(classId: string, name: string, memberIds: string[]): Promise<ActionResult> {
  if (memberIds.length === 0) return { error: 'teamSetupInvalid' }
  if (!nameOk(name)) return { error: 'teamNameTooLong' }
  const supabase = await createClient()
  if (memberIds.length > (await loadTeamLimit(supabase, classId))) return { error: 'podFull' }
  const { error } = await supabase.rpc('organizer_create_team', {
    p_class: classId,
    p_name: name.trim() || null,
    p_members: memberIds,
  })
  if (error) return { error: toErrorKey('createTeam', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

export async function moveStudent(classId: string, userId: string, toPod: string | null): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('organizer_move_student', { p_class: classId, p_user: userId, p_to: toPod })
  if (error) return { error: toErrorKey('moveStudent', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

export async function autoSplit(classId: string, size: number): Promise<ActionResult> {
  const supabase = await createClient()
  if (!isAutoSplitSize(size, await loadTeamLimit(supabase, classId))) return { error: 'teamSetupInvalid' }
  const { error } = await supabase.rpc('organizer_auto_split', { p_class: classId, p_size: size })
  if (error) return { error: toErrorKey('autoSplit', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

// チームの人数の上限 (0053): 2–10 for the whole class. Lowering it removes
// nobody; a team over the new limit just takes no one new.
export async function setTeamSizeLimit(classId: string, limit: number): Promise<ActionResult> {
  if (!isTeamSizeLimit(limit)) return { error: 'teamSizeInvalid' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_team_size_limit', { p_class: classId, p_limit: limit })
  if (error) {
    return {
      error: toErrorKey('setTeamSizeLimit', error, {
        [DB_CODES.teamSetupInvalid]: 'teamSizeInvalid',
        [DB_CODES.insufficientPrivilege]: 'notAllowed',
      }),
    }
  }
  refresh(classId)
  revalidatePath('/classes')
  return { error: null }
}

export async function renameTeam(classId: string, podId: string, name: string): Promise<ActionResult> {
  if (!nameOk(name)) return { error: 'teamNameTooLong' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('rename_team', { p_pod: podId, p_name: name.trim() })
  if (error) return { error: toErrorKey('renameTeam', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

export async function postAnnouncement(classId: string, body: string): Promise<ActionResult> {
  const text = body.trim()
  if (!text) return { error: 'announcementRequired' }
  if ([...text].length > ANNOUNCEMENT_MAX) return { error: 'announcementTooLong' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('post_class_announcement', { p_class: classId, p_body: text })
  if (error) return { error: toErrorKey('postAnnouncement', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

export async function deleteAnnouncement(classId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_class_announcement', { p_id: id })
  if (error) return { error: toErrorKey('deleteAnnouncement', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

// 目安 (0038): the organizer's checkpoints for every team in the class.
export async function addMilestone(classId: string, title: string, due: string, percent: number): Promise<ActionResult> {
  if (!isMilestoneInput(title, due, percent)) return { error: 'milestoneInvalid' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_class_milestone', {
    p_class: classId,
    p_title: title.trim(),
    p_due: due,
    p_percent: percent,
  })
  if (error) return { error: toErrorKey('addMilestone', error, { [DB_CODES.planningInvalid]: 'milestoneLimit', [DB_CODES.insufficientPrivilege]: 'notAllowed' }) }
  refresh(classId)
  return { error: null }
}

export async function deleteMilestone(classId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_class_milestone', { p_id: id })
  if (error) return { error: toErrorKey('deleteMilestone', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}

// 入れ替える (0039): two students in different teams change places in one
// step, so it works between full teams too.
export async function swapStudents(classId: string, a: string, b: string): Promise<ActionResult> {
  if (a === b) return { error: 'teamSetupInvalid' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('organizer_swap_students', { p_class: classId, p_a: a, p_b: b })
  if (error) return { error: toErrorKey('swapStudents', error, TEAM_ERRORS) }
  refresh(classId)
  return { error: null }
}
