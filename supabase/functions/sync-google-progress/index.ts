// sync-google-progress: counts linked Google files (0023) and records the
// change as task progress.
//
// Called only by our database (0026): request_google_sync() when a student
// opens the project board ({"project_ids": [...]}), and pg_cron every 5
// minutes ({"all": true}). Deployed with verify_jwt = false; every call must
// carry the same HMAC signature as send-nudge-push (_shared/signature.ts,
// secret PUSH_WEBHOOK_SECRET), anything else gets a 401.
//
// For each linked task it uses the token of whoever linked the file, reads
// the Doc (whole, or one heading's section) or the Slides file, counts it in
// memory and calls record_synced_count(). The text is never stored, logged or
// returned. It logs only what failed and how: never a token, file id or text.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY,
// PUSH_WEBHOOK_SECRET (all Edge Function secrets).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'
import { verifySignature } from '../_shared/signature.ts'
import { decryptToken } from '../_shared/token-crypto.ts'
import { fetchDoc, fetchPresentation, refreshAccessToken, type GoogleClient } from '../_shared/google-api.ts'
import { countDoc, countSlides, type DocsDocument } from '../_shared/google-count.ts'

const MAX_BODY_BYTES = 8 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const env = (name: string) => Deno.env.get(name) ?? ''

// The admin key Supabase gives every Edge Function. It never leaves Supabase.
function adminKey(): string {
  const keys = env('SUPABASE_SECRET_KEYS')
  if (keys) return JSON.parse(keys).default ?? ''
  return env('SUPABASE_SERVICE_ROLE_KEY')
}

type Source = { task_id: string; kind: 'doc' | 'doc_section' | 'slides'; file_id: string; heading_id: string | null; linked_by: string }

async function markLost(db: SupabaseClient, taskIds: string[]) {
  for (const id of taskIds) await db.rpc('mark_task_source_lost', { p_task: id })
}

// One student's links, read with their token. Files shared by several
// sections (the group Doc) are fetched once per run.
async function syncLinker(db: SupabaseClient, client: GoogleClient, tokenKey: string, linker: string, sources: Source[]) {
  const { data: creds } = await db.rpc('get_google_credentials', { p_user: linker }).maybeSingle<{ refresh_token_enc: string }>()
  const refresh = creds ? await decryptToken(creds.refresh_token_enc, tokenKey) : null
  if (!refresh) {
    await markLost(db, sources.map((s) => s.task_id))
    return
  }
  const token = await refreshAccessToken(client, refresh)
  if (!token.ok) {
    if (token.reason === 'gone') await markLost(db, sources.map((s) => s.task_id))
    else console.error('[sync-google-progress] token refresh failed')
    return
  }

  const docs = new Map<string, Promise<Awaited<ReturnType<typeof fetchDoc>>>>()
  for (const s of sources) {
    let count: number | null = null
    let lost = false
    if (s.kind === 'slides') {
      const res = await fetchPresentation(token.accessToken, s.file_id)
      if (res.ok) count = countSlides(res.value)
      else lost = res.reason === 'lost'
    } else {
      if (!docs.has(s.file_id)) docs.set(s.file_id, fetchDoc(token.accessToken, s.file_id))
      const res = await docs.get(s.file_id)!
      if (res.ok) {
        count = countDoc(res.value as DocsDocument, s.kind === 'doc_section' ? s.heading_id : null)
        lost = count === null // the heading was deleted
      } else {
        lost = res.reason === 'lost'
      }
    }

    if (count !== null) {
      const { error } = await db.rpc('record_synced_count', { p_task: s.task_id, p_count: count })
      if (error) console.error(`[sync-google-progress] record failed code=${error.code ?? 'none'}`)
    } else if (lost) {
      await markLost(db, [s.task_id])
    } else {
      console.error('[sync-google-progress] read failed')
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 })

  // The signature covers the exact bytes, so read the body as text first.
  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return new Response(null, { status: 413 })
  const signed = await verifySignature(
    env('PUSH_WEBHOOK_SECRET'),
    req.headers.get('x-push-timestamp'),
    req.headers.get('x-push-signature'),
    raw
  )
  if (!signed) return new Response(null, { status: 401 })

  const client: GoogleClient = { clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET') }
  const tokenKey = env('GOOGLE_TOKEN_KEY')
  if (!client.clientId || !client.clientSecret || !tokenKey) {
    console.error('[sync-google-progress] Google secrets missing')
    return new Response(null, { status: 500 })
  }

  let body: { project_ids?: unknown; all?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  let projectIds: string[] | null = null
  if (Array.isArray(body.project_ids)) {
    if (body.project_ids.length === 0 || body.project_ids.length > 20 || !body.project_ids.every((id) => typeof id === 'string' && UUID.test(id))) {
      return new Response(null, { status: 400 })
    }
    projectIds = body.project_ids as string[]
  } else if (body.all !== true) {
    return new Response(null, { status: 400 })
  }

  const db = createClient(env('SUPABASE_URL'), adminKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: sources, error } = await db.rpc('google_sources_to_sync', { p_project_ids: projectIds })
  if (error) {
    console.error(`[sync-google-progress] list failed code=${error.code ?? 'none'}`)
    return new Response(null, { status: 500 })
  }

  const byLinker = new Map<string, Source[]>()
  for (const s of (sources ?? []) as Source[]) byLinker.set(s.linked_by, [...(byLinker.get(s.linked_by) ?? []), s])
  for (const [linker, list] of byLinker) {
    try {
      await syncLinker(db, client, tokenKey, linker, list)
    } catch (e) {
      console.error(`[sync-google-progress] linker failed error=${(e as Error).name}`)
    }
  }
  return new Response(null, { status: 204 })
})
