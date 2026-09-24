import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  // 'local' ends only this browser's session. The default ('global') would
  // also log the student out on every other device, e.g. their phone when
  // they log out of a shared lab PC.
  await supabase.auth.signOut({ scope: 'local' })
  return NextResponse.redirect(new URL('/login', request.url))
}
