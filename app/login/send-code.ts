import { createClient } from '@/lib/supabase/client'

// Sends the email with the 6-digit code and the button. Runs in the browser on
// purpose: each student's request reaches Supabase from their own IP, so
// Supabase's per-IP auth limits apply per student, not to the whole class
// behind Vercel's IPs. Used for the first send and for resends.
//
// emailRedirectTo becomes {{ .RedirectTo }} in the email. The new templates
// only read `next` out of it (see nextFromRedirectTo); emails built from the
// old template still send the student through /auth/callback, so the old
// link keeps working.
export function sendLoginCode(email: string, next: string) {
  const redirectTo = new URL('/auth/callback', window.location.origin)
  if (next !== '/') redirectTo.searchParams.set('next', next)

  return createClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo.toString() },
  })
}
