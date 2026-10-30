'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ErrorKey } from '@/lib/errors'
import { checkClassProject, type ClassProjectTaskRow } from '@/lib/class-project'

export type ClassProjectResult = { error: ErrorKey | null; taskIndex: number | null }

// The organizer saves the class project (0029). set_class_project() checks
// that the caller is this class's organizer; teams that already have a
// project keep theirs.
export async function saveClassProject(classId: string, formData: FormData): Promise<ClassProjectResult> {
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
  const { error } = await supabase.rpc('set_class_project', {
    p_class: classId,
    p_title: checked.value.title,
    p_deadline: checked.value.deadline,
    p_every: checked.value.every,
    p_tasks: checked.value.tasks,
  })
  if (error) return { error: toErrorKey('saveClassProject', error), taskIndex: null }

  revalidatePath(`/classes/${classId}`)
  return { error: null, taskIndex: null }
}
