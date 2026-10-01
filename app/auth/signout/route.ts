import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_ENDPOINT_LENGTH = 1024

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // This device's push subscription goes first, while the student is still
  // signed in (RLS: only their own row). The sign-out form sends the
  // endpoint; without JavaScript there is none, and the row is removed the
  // next time a push to it fails.
  const form = await request.formData().catch(() => null)
  const endpoint = form?.get('push_endpoint')
  if (typeof endpoint === 'string' && endpoint.length > 0 && endpoint.length <= MAX_ENDPOINT_LENGTH) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }

  // 'local' ends only this browser's session. The default ('global') would
  // also log the student out on every other device, e.g. their phone when
  // they log out of a shared lab PC.
  await supabase.auth.signOut({ scope: 'local' })
  return NextResponse.redirect(new URL('/login', request.url))
}
