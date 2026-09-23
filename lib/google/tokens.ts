// Server-only helpers for the Google Docs POC. Tokens live in an httpOnly
// cookie only — no database, per the POC's hard limits. GOOGLE_CLIENT_SECRET
// is only ever referenced in this file, which is only ever imported by
// Route Handlers (never a 'use client' component).

import { cookies } from 'next/headers'

const TOKEN_COOKIE = 'google_poc_tokens'
const STATE_COOKIE = 'google_poc_oauth_state'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

type GoogleTokens = {
  access_token: string
  refresh_token: string
  expires_at: number // epoch ms
}

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

export async function getStoredTokens(): Promise<GoogleTokens | null> {
  const store = await cookies()
  const raw = store.get(TOKEN_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as GoogleTokens
  } catch {
    return null
  }
}

async function storeTokens(tokens: GoogleTokens) {
  const store = await cookies()
  store.set(TOKEN_COOKIE, JSON.stringify(tokens), cookieOptions)
}

export async function storeState(state: string) {
  const store = await cookies()
  store.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 })
}

export async function readState(): Promise<string | null> {
  const store = await cookies()
  return store.get(STATE_COOKIE)?.value ?? null
}

export async function clearState() {
  const store = await cookies()
  store.delete(STATE_COOKIE)
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`)
  }
  const data = await res.json()
  if (!data.refresh_token) {
    throw new Error(
      'No refresh_token returned by Google. It only issues one on first consent — ' +
        'revoke access at https://myaccount.google.com/permissions and reconnect.'
    )
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_at: number }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`)
  }
  const data = await res.json()
  return {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

export async function storeInitialTokens(tokens: GoogleTokens) {
  await storeTokens(tokens)
}

// Returns a valid access token, refreshing (and persisting the refresh) if
// needed. forceRefresh ignores the cached expiry and refreshes unconditionally
// — used to prove the refresh token alone is sufficient, without the user
// present.
export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  const tokens = await getStoredTokens()
  if (!tokens) throw new Error('Not connected to Google.')

  const isExpired = Date.now() >= tokens.expires_at - 30_000 // 30s skew buffer
  if (!forceRefresh && !isExpired) {
    return tokens.access_token
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token)
  const updated: GoogleTokens = {
    access_token: refreshed.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: refreshed.expires_at,
  }
  await storeTokens(updated)
  return updated.access_token
}
