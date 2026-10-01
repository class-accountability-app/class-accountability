// send-nudge-push: sends the Web Push for a new nudge.
//
// Called only by our database (0018: the nudges trigger, and pg_cron at
// 07:00 JST), never by a browser. Deployed with verify_jwt = false: the only
// JWT the database could send is the public anon key, which proves nothing.
// Instead every call must be signed with the shared secret (Vault
// push_webhook_secret = Edge Function secret PUSH_WEBHOOK_SECRET); anything
// else gets a 401. See _shared/signature.ts.
//
// It logs only what failed and how: never an endpoint, key, secret or payload.
import webpush from 'npm:web-push@3.6.7'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'
import { isQuietHours } from '../_shared/quiet-hours.ts'
import { pushText } from '../_shared/push-text.ts'
import { verifySignature } from '../_shared/signature.ts'

const MAX_NUDGE_AGE_MS = 10 * 60 * 1000 // a live call is for a nudge just sent
const MAX_HELD_AGE_MS = 12 * 60 * 60 * 1000 // held overnight at most
const PUSH_TTL_SECONDS = 12 * 60 * 60
// Real bodies are under 60 bytes; anything bigger is refused before (and,
// if Content-Length lied, right after) it is read.
const MAX_BODY_BYTES = 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const env = (name: string) => Deno.env.get(name) ?? ''

// The admin key Supabase gives every Edge Function. It never leaves Supabase.
function adminKey(): string {
  const keys = env('SUPABASE_SECRET_KEYS')
  if (keys) return JSON.parse(keys).default ?? ''
  return env('SUPABASE_SERVICE_ROLE_KEY')
}

type Sender = { from_user_id: string }

async function notify(db: SupabaseClient, toUserId: string, nudges: Sender[]) {
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, locale')
    .eq('user_id', toUserId)
  if (!subs?.length) return

  let name: string | null = null
  if (nudges.length === 1) {
    const { data } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', nudges[0].from_user_id)
      .maybeSingle()
    name = data?.display_name ?? null
  }

  for (const sub of subs) {
    const text = pushText(sub.locale, nudges.length, name)
    // The service worker always opens /nudges; no URL travels in the payload.
    const payload = JSON.stringify({ title: text.title, body: text.body })
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: PUSH_TTL_SECONDS, urgency: 'normal', topic: 'nudge' }
      )
      await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // The browser dropped this subscription; so do we.
        await db.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error(`[send-nudge-push] send failed status=${status ?? 'none'} error=${(error as Error).name}`)
      }
    }
  }
}

// 07:00 JST: one push per recipient for everything held overnight.
async function flushHeld(db: SupabaseClient) {
  const { data: held } = await db
    .from('push_held_nudges')
    .select('nudge_id, held_at, nudges(from_user_id, to_user_id)')
  if (!held?.length) return

  // Delete first: a crash part-way means a missed push, never a repeated one.
  await db
    .from('push_held_nudges')
    .delete()
    .in('nudge_id', held.map((h) => h.nudge_id))

  const byRecipient = new Map<string, Sender[]>()
  for (const h of held) {
    const nudge = h.nudges as unknown as { from_user_id: string; to_user_id: string } | null
    if (!nudge || Date.now() - Date.parse(h.held_at) > MAX_HELD_AGE_MS) continue
    byRecipient.set(nudge.to_user_id, [...(byRecipient.get(nudge.to_user_id) ?? []), nudge])
  }
  for (const [toUserId, nudges] of byRecipient) await notify(db, toUserId, nudges)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 })
  }

  // The signature covers the exact bytes, so read the body as text first.
  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 })
  }
  const signed = await verifySignature(
    env('PUSH_WEBHOOK_SECRET'),
    req.headers.get('x-push-timestamp'),
    req.headers.get('x-push-signature'),
    raw
  )
  if (!signed) return new Response(null, { status: 401 })

  const vapidPublic = env('VAPID_PUBLIC_KEY')
  const vapidPrivate = env('VAPID_PRIVATE_KEY')
  const vapidSubject = env('VAPID_SUBJECT')
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    console.error('[send-nudge-push] VAPID secrets missing')
    return new Response(null, { status: 500 })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  let body: { nudge_id?: unknown; flush?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }

  const db = createClient(env('SUPABASE_URL'), adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (body.flush === true) {
    await flushHeld(db)
    return new Response(null, { status: 204 })
  }

  if (typeof body.nudge_id !== 'string' || !UUID.test(body.nudge_id)) {
    return new Response(null, { status: 400 })
  }

  const { data: nudge } = await db
    .from('nudges')
    .select('id, from_user_id, to_user_id, created_at')
    .eq('id', body.nudge_id)
    .maybeSingle()
  // Unknown or old: nothing to do (this also stops replays of old nudges).
  if (!nudge || Date.now() - Date.parse(nudge.created_at) > MAX_NUDGE_AGE_MS) {
    return new Response(null, { status: 204 })
  }

  if (isQuietHours(new Date())) {
    await db.from('push_held_nudges').upsert({ nudge_id: nudge.id }, { ignoreDuplicates: true })
  } else {
    await notify(db, nudge.to_user_id, [nudge])
  }
  return new Response(null, { status: 204 })
})
