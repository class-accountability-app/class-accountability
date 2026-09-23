import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, readState, clearState, storeInitialTokens } from '@/lib/google/tokens'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const storedState = await readState()
  await clearState()

  if (error) {
    return NextResponse.redirect(
      new URL(`/dev/google-poc?error=${encodeURIComponent(error)}`, request.url)
    )
  }
  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/dev/google-poc?error=state_mismatch', request.url))
  }

  const redirectUri = new URL('/api/google/callback', request.url).toString()
  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    await storeInitialTokens(tokens)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.redirect(
      new URL(`/dev/google-poc?error=${encodeURIComponent(message)}`, request.url)
    )
  }

  return NextResponse.redirect(new URL('/dev/google-poc?connected=1', request.url))
}
