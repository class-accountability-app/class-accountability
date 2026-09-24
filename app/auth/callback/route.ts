import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/errors'
import { safeNextPath } from '@/lib/auth/next-path'

// The old magic-link flow ({{ .ConfirmationURL }} in the email). Kept until
// every email in circulation uses the new /auth/confirm button. It only works
// in the browser that asked for the email (PKCE needs that browser's code
// verifier cookie), which is why the new flow exists.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = safeNextPath(request.nextUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
    logServerError('authCallback', error)
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
