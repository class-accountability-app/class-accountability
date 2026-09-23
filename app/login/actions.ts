'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'

// Runs on the server (not in the browser) so a failed sign-in is logged to
// Vercel. The PKCE code verifier is stored in a cookie here and read back by
// /auth/callback, exactly as when this ran client-side.
//
// No domain check here on purpose: the signup trigger is the one rule, and a
// second copy in the app could lock out an older account it doesn't know about.
export async function requestLoginLink(formData: FormData): Promise<ActionResult> {
  const email = formData.get('email')?.toString().trim()
  if (!email) {
    return { error: 'emailInvalid' }
  }

  const origin = (await headers()).get('origin')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    return { error: toErrorKey('requestLoginLink', error) }
  }

  return { error: null }
}
