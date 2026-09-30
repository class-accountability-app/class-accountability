'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NAME_OK_COOKIE } from '@/lib/supabase/middleware'
import { SETUP_SEEN_COOKIE } from '@/lib/checklist'
import { ACCOUNT_DELETED_PATH } from '@/lib/contact'
import { isConfirmWord } from '@/lib/delete-account'
import { DB_CODES, toErrorKey, type ActionResult } from '@/lib/errors'

// delete_my_account (0016) deletes the caller's auth.users row as postgres;
// everything that belongs to them cascades. No service_role key anywhere.
export async function deleteAccount(formData: FormData): Promise<ActionResult> {
  // The button is disabled until the word matches; this is the real check.
  if (!isConfirmWord(formData.get('confirm'))) {
    return { error: 'confirmWordMismatch' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { error } = await supabase.rpc('delete_my_account')

  if (error) {
    return {
      error: toErrorKey('deleteAccount', error, {
        [DB_CODES.organizerHasStudents]: 'organizerHasStudents',
      }),
    }
  }

  // The user and their sessions are gone. signOut clears this browser's
  // session cookies; Supabase answers the vanished session with 403/404,
  // which supabase-js treats as already signed out.
  await supabase.auth.signOut({ scope: 'local' })

  const jar = await cookies()
  // Belt and braces: any auth cookie signOut left behind, and the two
  // shortcut cookies that hold the user id.
  for (const { name } of jar.getAll()) {
    if (name.startsWith('sb-')) jar.delete(name)
  }
  jar.delete(NAME_OK_COOKIE)
  jar.delete(SETUP_SEEN_COOKIE)

  redirect(ACCOUNT_DELETED_PATH)
}
