// send-nudge-push: sends Web Pushes. A new nudge (0018), and the pushes the
// database queues in push_events (0025: meeting reminders, stalled tasks).
//
// Called only by our database (0018: the nudges trigger and pg_cron at
// 07:00 JST; 0025: pg_cron with {"events": true}), never by a browser.
// Deployed with verify_jwt = false: the only JWT the database could send is
// the public anon key, which proves nothing.
// Instead every call must be signed with the shared secret (Vault
// push_webhook_secret = Edge Function secret PUSH_WEBHOOK_SECRET); anything
// else gets a 401. See _shared/signature.ts.
//
// It logs only what failed and how: never an endpoint, key, secret or payload.
import webpush from 'npm:web-push@3.6.7'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'
import { isQuietHours } from '../_shared/quiet-hours.ts'
import { checkinDueText, meetingReminderText, pushText, stalledTaskText } from '../_shared/push-text.ts'
import { meetingPath, projectPath } from '../_shared/push-path.ts'
import { verifySignature } from '../_shared/signature.ts'

const MAX_NUDGE_AGE_MS = 10 * 60 * 1000 // a live call is for a nudge just sent
const MAX_HELD_AGE_MS = 12 * 60 * 60 * 1000 // held overnight at most
const MAX_EVENT_AGE_MS = 12 * 60 * 60 * 1000 // a queued push older than this is dropped
const STALL_DAYS = 3 // matches 0025's private.queue_stalled_tasks()
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
type Payload = { title: string; body: string; kind?: string; path?: string }

// Sends one notification to each of a student's devices. `make` builds it in
// the device's language. Dead subscriptions are removed.
async function sendToUser(db: SupabaseClient, userId: string, topic: string, make: (locale: string) => Payload) {
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, locale')
    .eq('user_id', userId)
  if (!subs?.length) return

  for (const sub of subs) {
    const payload = JSON.stringify(make(sub.locale))
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: PUSH_TTL_SECONDS, urgency: 'normal', topic }
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

async function notify(db: SupabaseClient, toUserId: string, nudges: Sender[]) {
  let name: string | null = null
  if (nudges.length === 1) {
    const { data } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', nudges[0].from_user_id)
      .maybeSingle()
    name = data?.display_name ?? null
  }

  // No path: the service worker opens /nudges.
  await sendToUser(db, toUserId, 'nudge', (locale) => pushText(locale, nudges.length, name))
}

type PushEvent = {
  id: string
  user_id: string
  kind: 'meeting_reminder' | 'task_stalled' | 'checkin_due'
  poll_id: string | null
  task_id: string | null
  project_id: string | null
  needs_checkin: boolean
}

// The class a project belongs to, for the page the push opens.
async function classOfProject(db: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await db.from('projects').select('pairings(class_id)').eq('id', projectId).maybeSingle()
  return (data?.pairings as unknown as { class_id: string } | null)?.class_id ?? null
}

// Today in Tokyo as YYYY-MM-DD.
function tokyoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

// The same rule as public.checkin_round_start (0022) and lib/checkin.ts.
function roundStart(start: string, every: number, today: string): string {
  const day = 86_400_000
  const elapsed = Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / day))
  return new Date(Date.parse(start) + Math.floor(elapsed / every) * every * day).toISOString().slice(0, 10)
}

// 0025: claims every unsent push_events row (marking it sent first, so a
// crash means a missed push, never a repeated one), drops stale ones, and
// sends the rest if the situation still holds (the meeting is still on, the
// task still stalled and still theirs).
async function sendEvents(db: SupabaseClient) {
  const { data: claimed } = await db
    .from('push_events')
    .update({ sent_at: new Date().toISOString() })
    .is('sent_at', null)
    .gt('created_at', new Date(Date.now() - MAX_EVENT_AGE_MS).toISOString())
    .select('id, user_id, kind, poll_id, task_id, project_id, needs_checkin')
  // Anything older was never sent in time: mark it so it is not looked at again.
  await db.from('push_events').update({ sent_at: new Date().toISOString() }).is('sent_at', null)

  for (const event of (claimed ?? []) as PushEvent[]) {
    if (event.kind === 'meeting_reminder' && event.poll_id) {
      const { data: poll } = await db
        .from('meeting_polls')
        .select('id, project_id, status, meeting_poll_options!meeting_polls_chosen_option_fk(starts_at)')
        .eq('id', event.poll_id)
        .maybeSingle()
      const chosen = poll?.meeting_poll_options as unknown as { starts_at: string } | null
      if (!poll || poll.status !== 'confirmed' || !chosen || Date.parse(chosen.starts_at) <= Date.now()) continue
      const classId = await classOfProject(db, poll.project_id)
      if (!classId) continue
      const startsAt = new Date(chosen.starts_at)
      await sendToUser(db, event.user_id, 'meeting', (locale) => ({
        ...meetingReminderText(locale, startsAt, event.needs_checkin),
        kind: 'meeting_reminder',
        path: meetingPath(classId, poll.id),
      }))
    } else if (event.kind === 'task_stalled' && event.task_id) {
      const { data: task } = await db
        .from('project_tasks')
        .select('id, title, owner_id, status, project_id')
        .eq('id', event.task_id)
        .maybeSingle()
      if (!task || task.owner_id !== event.user_id || task.status === 'done') continue
      const classId = await classOfProject(db, task.project_id)
      if (!classId) continue
      await sendToUser(db, event.user_id, 'stalled', (locale) => ({
        ...stalledTaskText(locale, task.title, STALL_DAYS),
        kind: 'task_stalled',
        path: projectPath(classId),
      }))
    } else if (event.kind === 'checkin_due' && event.project_id) {
      // 0033: still active, and they still haven't shared this round.
      const { data: project } = await db
        .from('projects')
        .select('id, status, start_date, checkin_every_days')
        .eq('id', event.project_id)
        .maybeSingle()
      if (!project || project.status !== 'active') continue
      const { count } = await db
        .from('project_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('user_id', event.user_id)
        .eq('round_start', roundStart(project.start_date, project.checkin_every_days, tokyoToday()))
      if ((count ?? 0) > 0) continue
      const classId = await classOfProject(db, project.id)
      if (!classId) continue
      await sendToUser(db, event.user_id, 'checkin', (locale) => ({
        ...checkinDueText(locale),
        kind: 'checkin_due',
        path: projectPath(classId),
      }))
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

  let body: { nudge_id?: unknown; flush?: unknown; events?: unknown }
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
    await sendEvents(db)
    return new Response(null, { status: 204 })
  }

  // 0025's jobs: quiet hours leave the rows for the 07:00 flush.
  if (body.events === true) {
    if (!isQuietHours(new Date())) await sendEvents(db)
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
