'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const UNIQUE_VIOLATION = '23505'

export async function createClass(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const name = formData.get('name')?.toString().trim()
  const university = formData.get('university')?.toString().trim()
  const term = formData.get('term')?.toString().trim()

  if (!name || !university || !term) {
    return { error: 'Name, university, and term are all required.' }
  }

  const { error } = await supabase
    .from('classes')
    .insert({ name, university, term, created_by: user.id })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/classes')
  return { error: null }
}

export async function joinClass(classId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { error } = await supabase
    .from('class_memberships')
    .insert({ user_id: user.id, class_id: classId })

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: "You've already joined this class." }
    }
    return { error: error.message }
  }

  revalidatePath('/classes')
  return { error: null }
}
