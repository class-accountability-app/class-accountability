import type { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/supabase/functions/_shared/token-crypto'
import { refreshAccessToken, type GoogleClient } from '@/supabase/functions/_shared/google-api'

// Server-only (Route Handlers and server actions; never imported by a
// 'use client' file): the Google client secret and GOOGLE_TOKEN_KEY are read
// here. The server acts as the signed-in student; it never has the Supabase
// admin key (decision 2026-10-26, 0026).

type Supabase = Awaited<ReturnType<typeof createClient>>

export function googleClient(): GoogleClient | null {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function tokenKey(): string | null {
  return process.env.GOOGLE_TOKEN_KEY || null
}

export type MyToken =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; reason: 'unavailable' | 'notConnected' | 'reconnect' | 'failed' }

// A fresh access token for the signed-in student, from their own stored
// (encrypted) connection. 'reconnect': Google no longer accepts it.
export async function myAccessToken(supabase: Supabase): Promise<MyToken> {
  const client = googleClient()
  const key = tokenKey()
  if (!client || !key) return { ok: false, reason: 'unavailable' }

  const { data } = await supabase.rpc('get_my_google_credentials').maybeSingle<{ refresh_token_enc: string }>()
  if (!data) return { ok: false, reason: 'notConnected' }
  const refreshToken = await decryptToken(data.refresh_token_enc, key)
  if (!refreshToken) return { ok: false, reason: 'reconnect' }

  const token = await refreshAccessToken(client, refreshToken)
  if (!token.ok) return { ok: false, reason: token.reason === 'gone' ? 'reconnect' : 'failed' }
  return { ok: true, accessToken: token.accessToken, refreshToken }
}
