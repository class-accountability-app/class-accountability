'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'

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

  // The creator is now its first member (0013), so Home and the tab bar change too.
  revalidatePath('/', 'layout')
  return { error: null }
}
