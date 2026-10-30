'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'
import { tokyoToday } from '@/lib/date'
import { checkTask, isTaskMetric, isTaskStatus, parseWholeAmount, type TaskProblem } from '@/lib/tasks'
import type { ErrorKey } from '@/lib/errors'

// Group projects (0022). The database decides who may do what: any pod member
// starts the project and edits its tasks, only a task's owner logs on it. The
// checks here only turn the common mistakes into a clear message first.

const NOTE_MAX = 280
const CHECKIN_EVERY_DEFAULT = 4

const TASK_PROBLEM_ERRORS: Record<TaskProblem, ErrorKey> = {
  titleRequired: 'titleRequired',
  titleTooLong: 'titleTooLong',
  unitRequired: 'unitRequired',
  unitTooLong: 'unitTooLong',
  amountInvalid: 'targetAmountPositive',
  documentNeedsCharacters: 'generic',
}

function refresh(classId: string) {
  revalidatePath(`/classes/${classId}/project`)
  revalidatePath(`/classes/${classId}`)
}

export async function createProject(classId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const title = formData.get('title')?.toString().trim() ?? ''
  const deadline = formData.get('deadline')?.toString().trim() || null
  const everyRaw = formData.get('checkin_every')?.toString().trim() || String(CHECKIN_EVERY_DEFAULT)

  if (!title) return { error: 'titleRequired' }
  if ([...title].length > 120) return { error: 'titleTooLong' }
  // The project starts today (Tokyo), so a deadline before today can't be met.
  if (deadline !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < tokyoToday())) {
    return { error: 'deadlineInPast' }
  }
  const every = parseWholeAmount(everyRaw)
  if (every === null || every > 14) return { error: 'checkinEveryInvalid' }

  const { data: pod, error: podError } = await supabase
    .from('pairing_members')
    .select('pairing_id, pairings!inner(class_id, status)')
    .eq('user_id', user.id)
    .eq('pairings.class_id', classId)
    .eq('pairings.status', 'active')
    .limit(1)
    .maybeSingle()
  if (podError) return { error: toErrorKey('createProject.pod', podError) }
  if (!pod) return { error: 'projectNeedsPod' }

  const { error } = await supabase.from('projects').insert({
    pairing_id: pod.pairing_id,
    title,
    deadline,
    checkin_every_days: every,
    created_by: user.id,
  })
  if (error) {
    // One project per pod: a podmate started it a moment ago.
    return { error: toErrorKey('createProject', error, { [DB_CODES.uniqueViolation]: 'projectExists' }) }
  }

  refresh(classId)
  return { error: null }
}

export async function addTask(classId: string, projectId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const metric = formData.get('metric')?.toString()
  if (!isTaskMetric(metric)) return { error: 'generic' }

  const goalRaw = formData.get('target_amount')?.toString().trim() ?? ''
  let targetAmount: number | null = null
  if (metric !== 'status' && goalRaw !== '') {
    targetAmount = parseWholeAmount(goalRaw)
    if (targetAmount === null) return { error: 'targetAmountPositive' }
  }

  const checked = checkTask({
    title: formData.get('title')?.toString() ?? '',
    metric,
    unit: formData.get('unit')?.toString() ?? '',
    targetAmount,
    inputMode: 'manual',
  })
  if (!checked.ok) return { error: TASK_PROBLEM_ERRORS[checked.problem] }

  const ownerId = formData.get('owner_id')?.toString() || null
  const due = formData.get('due')?.toString().trim() || null

  const { error } = await supabase.from('project_tasks').insert({
    project_id: projectId,
    title: checked.value.title,
    owner_id: ownerId,
    metric: checked.value.metric,
    unit: checked.value.unit,
    target_amount: checked.value.targetAmount,
    due,
  })
  if (error) {
    return {
      error: toErrorKey('addTask', error, {
        [DB_CODES.taskOwnerNotInPod]: 'taskOwnerNotInPod',
        [DB_CODES.insufficientPrivilege]: 'notAllowed',
      }),
    }
  }

  refresh(classId)
  return { error: null }
}

// 担当する: take a task nobody owns. Only an unowned task changes hands here,
// so two people tapping at once can't take it from each other.
export async function claimTask(classId: string, taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const { data, error } = await supabase
    .from('project_tasks')
    .update({ owner_id: user.id })
    .eq('id', taskId)
    .is('owner_id', null)
    .select('id')
  if (error) return { error: toErrorKey('claimTask', error, { [DB_CODES.taskOwnerNotInPod]: 'taskOwnerNotInPod' }) }
  if (!data || data.length === 0) return { error: 'taskTaken' }

  refresh(classId)
  return { error: null }
}

// 「Study Pods で書く」 for one of my characters tasks (0030): the task is
// then counted from the text written in the app. The database refuses a task
// that already has progress logged (SP006).
export async function writeInApp(classId: string, taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const { data, error } = await supabase
    .from('project_tasks')
    .update({ input_mode: 'document' })
    .eq('id', taskId)
    .eq('owner_id', user.id)
    .eq('metric', 'characters')
    .select('id')
  if (error) return { error: toErrorKey('writeInApp', error, { [DB_CODES.documentModeLocked]: 'taskDocumentLocked' }) }
  if (!data || data.length === 0) return { error: 'generic' }

  refresh(classId)
  return { error: null }
}

export async function setTaskStatus(classId: string, taskId: string, status: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }
  if (!isTaskStatus(status)) return { error: 'generic' }

  const { data, error } = await supabase.from('project_tasks').update({ status }).eq('id', taskId).select('id')
  if (error) return { error: toErrorKey('setTaskStatus', error) }
  if (!data || data.length === 0) return { error: 'taskNotFound' }

  refresh(classId)
  return { error: null }
}

// 記録する on one of my counted tasks. `clientId` comes from the form, so a
// second tap (or a retry after a dropped connection) saves the entry once:
// the unique (user_id, client_id) violation means it is already saved.
export async function logTaskProgress(
  classId: string,
  taskId: string,
  input: { amount: string; note: string; clientId: string }
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const value = parseWholeAmount(input.amount)
  if (value === null) return { error: 'logAmountInvalid' }
  const note = input.note.trim() || null
  if (note !== null && [...note].length > NOTE_MAX) return { error: 'tooLong' }

  const { error } = await supabase.from('task_progress').insert({
    task_id: taskId,
    user_id: user.id,
    progress_value: value,
    note,
    client_id: input.clientId,
    source: 'manual',
  })
  if (error && error.code !== DB_CODES.uniqueViolation) {
    // RLS refuses an entry on someone else's task (or a status-only task).
    return { error: toErrorKey('logTaskProgress', error, { [DB_CODES.insufficientPrivilege]: 'notOwnTask' }) }
  }

  // The first entry means the work has started.
  await supabase.from('project_tasks').update({ status: 'doing' }).eq('id', taskId).eq('status', 'todo')

  refresh(classId)
  return { error: null }
}

// チェックインする: submit_checkin (0022) builds my snapshot in the database
// from my tasks, so the numbers can't be forged here; only the note is mine.
export async function submitCheckin(classId: string, projectId: string, note: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'signedOut' }

  const clean = note.trim()
  if ([...clean].length > NOTE_MAX) return { error: 'tooLong' }

  const { error } = await supabase.rpc('submit_checkin', { p_project: projectId, p_note: clean || null })
  if (error) {
    return {
      error: toErrorKey('submitCheckin', error, {
        [DB_CODES.checkinAlready]: 'checkinAlready',
        [DB_CODES.insufficientPrivilege]: 'notAllowed',
      }),
    }
  }

  refresh(classId)
  revalidatePath(`/classes/${classId}/project/checkins`)
  return { error: null }
}
