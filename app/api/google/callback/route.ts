import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'
import { logServerError } from '@/lib/errors'
import { OAUTH_COOKIE, safeReturnPath } from '@/lib/google-links'
import { googleClient, tokenKey } from '@/lib/google-server'
import { exchangeCode, revokeToken } from '@/supabase/functions/_shared/google-api'
import { encryptToken } from '@/supabase/functions/_shared/token-crypto'

// Back from Google's consent screen. Checks the state against this browser's
// cookie (and that the same student is signed in), swaps the code for tokens,
// encrypts the refresh token and stores it as the student's own row. The
// access token is not kept. Then back to the page the student came from.
function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(request: NextRequest) {
  const origin = await appOrigin()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', origin))

  let saved: { state?: string; returnTo?: string; userId?: string } = {}
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? '{}')
  } catch {
    saved = {}
  }
  const returnTo = safeReturnPath(saved.returnTo)
  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`${returnTo}?google=${result}`, origin))
    response.cookies.set(OAUTH_COOKIE, '', { path: '/api/google', maxAge: 0 })
    return response
  }

  const params = request.nextUrl.searchParams
  const state = params.get('state') ?? ''
  if (!saved.state || !sameText(saved.state, state) || saved.userId !== user.id) return back('failed')
  if (params.get('error')) return back('denied')

  const client = googleClient()
  const key = tokenKey()
  const code = params.get('code')
  if (!client || !key) return back('unavailable')
  if (!code) return back('failed')

  const tokens = await exchangeCode(client, code, `${origin}/api/google/callback`)
  if (!tokens.ok) return back('failed')

  const { error } = await supabase.rpc('save_my_google_credentials', {
    p_refresh_token_enc: await encryptToken(tokens.refreshToken, key),
    p_google_sub: null,
  })
  if (error) {
    logServerError('googleCallback.save', error)
    await revokeToken(tokens.refreshToken)
    return back('failed')
  }
  return back('connected')
}
