'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult, type ErrorKey } from '@/lib/errors'
import { checkClassProject, type ClassProjectTaskRow } from '@/lib/class-project'

export type ClassProjectResult = { error: ErrorKey | null; taskIndex: number | null }

// The organizer adds a project to the class's list (projectId null) or edits
// one (0045). The database checks that the caller is this class's organizer.
// Adding gives the project to every team at once; editing changes what teams
// get from now on, and a team's own copy stays as it is.
export async function saveClassProject(
  classId: string,
  projectId: string | null,
  formData: FormData,
): Promise<ClassProjectResult> {
  let tasks: ClassProjectTaskRow[]
  try {
    const parsed: unknown = JSON.parse(formData.get('tasks')?.toString() ?? '[]')
    tasks = Array.isArray(parsed) ? (parsed as ClassProjectTaskRow[]) : []
  } catch {
    return { error: 'generic', taskIndex: null }
  }

  const checked = checkClassProject({
    title: formData.get('title')?.toString() ?? '',
    deadline: formData.get('deadline')?.toString() ?? '',
    every: formData.get('every')?.toString() ?? '',
    tasks,
  })
  if (!checked.ok) return { error: checked.problem, taskIndex: checked.taskIndex }

  const supabase = await createClient()
  const fields = {
    p_title: checked.value.title,
    p_deadline: checked.value.deadline,
    p_every: checked.value.every,
    p_tasks: checked.value.tasks,
  }
  const { error } =
    projectId === null
      ? await supabase.rpc('add_class_project', { p_class: classId, ...fields })
      : await supabase.rpc('update_class_project', { p_id: projectId, ...fields })
  if (error) {
    return {
      error: toErrorKey('saveClassProject', error, {
        [DB_CODES.classProjectsFull]: 'classProjectsFull',
        [DB_CODES.insufficientPrivilege]: 'notAllowed',
      }),
      taskIndex: null,
    }
  }

  revalidatePath(`/classes/${classId}`)
  return { error: null, taskIndex: null }
}

// Takes a project off the class's list. Teams that already got it keep it.
export async function deleteClassProject(classId: string, projectId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_class_project', { p_id: projectId })
  if (error) {
    return { error: toErrorKey('deleteClassProject', error, { [DB_CODES.insufficientPrivilege]: 'notAllowed' }) }
  }
  revalidatePath(`/classes/${classId}`)
  return { error: null }
}
