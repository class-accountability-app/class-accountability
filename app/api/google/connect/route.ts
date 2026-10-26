import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'
import { OAUTH_COOKIE, safeReturnPath } from '@/lib/google-links'
import { googleClient, tokenKey } from '@/lib/google-server'
import { GOOGLE_SCOPE } from '@/supabase/functions/_shared/google-api'

// Google とつなぐ: sends the student to Google's consent screen for drive.file
// only. A random state in a short-lived httpOnly cookie ties the answer to
// this browser; the page to come back to is limited to the project pages.

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const origin = await appOrigin()
  if (!user) return NextResponse.redirect(new URL('/login', origin))

  const returnTo = safeReturnPath(new URL(request.url).searchParams.get('return'))
  const client = googleClient()
  if (!client || !tokenKey()) return NextResponse.redirect(new URL(`${returnTo}?google=unavailable`, origin))

  const state = randomBytes(24).toString('hex')
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    // Always ask again, so Google always returns a refresh token.
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  })
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, returnTo, userId: user.id }), {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/google',
    maxAge: 600,
  })
  return response
}
