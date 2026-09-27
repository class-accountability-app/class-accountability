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

  // Only approved accounts create classes (0015); the insert policy enforces
  // it, this only gives a clear message instead of "not allowed".
  const { data: profile } = await supabase
    .from('profiles')
    .select('can_create_classes')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.can_create_classes) {
    return { error: 'classCreateNotAllowed' }
  }

  const { error } = await supabase
    .from('classes')
    .insert({ name, university, term, created_by: user.id })

  if (error) {
    return {
      error: toErrorKey('createClass', error, {
        [DB_CODES.insufficientPrivilege]: 'classCreateNotAllowed',
      }),
    }
  }

  // The creator is now its organizer (0015), so Home and the tab bar change too.
  revalidatePath('/', 'layout')
  return { error: null }
}
