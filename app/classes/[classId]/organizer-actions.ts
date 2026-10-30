'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'
import { ANNOUNCEMENT_MAX, TEAM_NAME_MAX, isAutoSplitSize } from '@/lib/organizer'

// The organizer's team tools (0036). The database checks that the caller is
// this class's organizer and keeps every team rule (students only, one team
// per class, at most 6); these only turn common mistakes into clear messages.

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
  if (memberIds.length > 6) return { error: 'podFull' }
  if (!nameOk(name)) return { error: 'teamNameTooLong' }
  const supabase = await createClient()
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
  if (!isAutoSplitSize(size)) return { error: 'teamSetupInvalid' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('organizer_auto_split', { p_class: classId, p_size: size })
  if (error) return { error: toErrorKey('autoSplit', error, TEAM_ERRORS) }
  refresh(classId)
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
