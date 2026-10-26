import { DOC_FIELDS, SLIDES_FIELDS, type DocsDocument } from './google-count.ts'

// The few Google calls the app makes, with plain fetch so the same code runs
// in the Edge Function (Deno) and on the Next.js server (Node). Scope is
// drive.file only: Google answers 403/404 for any file the student didn't pick
// or the app didn't create. Errors are reported as a kind, never with the
// response body (which can echo request details).

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export type GoogleClient = { clientId: string; clientSecret: string }

// 'gone': the token was revoked or expired for good (reconnect needed).
export type TokenResult = { ok: true; accessToken: string } | { ok: false; reason: 'gone' | 'failed' }

export async function refreshAccessToken(client: GoogleClient, refreshToken: string): Promise<TokenResult> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (res.ok) {
    const json = (await res.json()) as { access_token?: string }
    return json.access_token ? { ok: true, accessToken: json.access_token } : { ok: false, reason: 'failed' }
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return { ok: false, reason: json.error === 'invalid_grant' ? 'gone' : 'failed' }
}

// After the consent screen: the code becomes tokens. A refresh token comes
// only with access_type=offline (and prompt=consent on a reconnect).
export async function exchangeCode(
  client: GoogleClient,
  code: string,
  redirectUri: string
): Promise<{ ok: true; refreshToken: string; accessToken: string; idToken: string | null } | { ok: false }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) return { ok: false }
  const json = (await res.json()) as { refresh_token?: string; access_token?: string; id_token?: string; scope?: string }
  if (!json.refresh_token || !json.access_token || !json.scope?.split(' ').includes(GOOGLE_SCOPE)) return { ok: false }
  return { ok: true, refreshToken: json.refresh_token, accessToken: json.access_token, idToken: json.id_token ?? null }
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined)
}

// 'lost': the student no longer has access to the file (or it was deleted).
export type Fetched<T> = { ok: true; value: T } | { ok: false; reason: 'lost' | 'failed' }

async function getJson<T>(url: string, accessToken: string): Promise<Fetched<T>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (res.ok) return { ok: true, value: (await res.json()) as T }
  return { ok: false, reason: res.status === 403 || res.status === 404 ? 'lost' : 'failed' }
}

export function fetchDoc(accessToken: string, fileId: string): Promise<Fetched<DocsDocument>> {
  return getJson(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DOC_FIELDS)}`,
    accessToken
  )
}

export function fetchPresentation(accessToken: string, fileId: string): Promise<Fetched<{ slides?: unknown[] }>> {
  return getJson(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(SLIDES_FIELDS)}`,
    accessToken
  )
}
