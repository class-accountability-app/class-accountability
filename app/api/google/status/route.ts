import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStoredTokens } from '@/lib/google/tokens'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const tokens = await getStoredTokens()
  return NextResponse.json({ connected: !!tokens })
}
