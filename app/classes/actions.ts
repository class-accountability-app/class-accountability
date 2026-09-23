'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'

export async function createClass(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const name = formData.get('name')?.toString().trim()
  const university = formData.get('university')?.toString().trim()
  const term = formData.get('term')?.toString().trim()

  if (!name || !university || !term) {
    return { error: 'classFieldsRequired' }
  }

  const { error } = await supabase
    .from('classes')
    .insert({ name, university, term, created_by: user.id })

  if (error) {
    return { error: toErrorKey('createClass', error) }
  }

  revalidatePath('/classes')
  return { error: null }
}

export async function joinClass(classId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { error } = await supabase
    .from('class_memberships')
    .insert({ user_id: user.id, class_id: classId })

  if (error) {
    return {
      error: toErrorKey('joinClass', error, { [DB_CODES.uniqueViolation]: 'alreadyJoinedClass' }),
    }
  }

  revalidatePath('/classes')
  return { error: null }
}
