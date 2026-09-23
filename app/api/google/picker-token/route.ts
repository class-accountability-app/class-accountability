import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/google/tokens'

// Hands the client a short-lived access token for the Picker widget only —
// the refresh token and client secret never leave the server.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const accessToken = await getValidAccessToken()
    return NextResponse.json({ accessToken })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
