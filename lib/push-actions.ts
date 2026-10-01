'use server'

import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { toErrorKey, type ActionResult } from '@/lib/errors'

// This device's push subscription (0018). Runs as the signed-in student:
// RLS lets them read and delete only their own rows, and rows are added only
// through save_push_subscription. Endpoints and keys are never logged:
// toErrorKey logs the Postgres code and message, which don't contain them.

const MAX_ENDPOINT_LENGTH = 1024

type SubscriptionJson = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

function isEndpoint(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ENDPOINT_LENGTH
}

// Saves (or takes over) this device's subscription for the signed-in
// student. The language is the one the student is using now (the locale
// cookie), since the database can't read cookies when the push is sent.
export async function savePushSubscription(
  subscription: SubscriptionJson,
  device: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { endpoint, keys } = subscription ?? {}
  if (!isEndpoint(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return { error: 'generic' }
  }

  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_locale: await getLocale(),
    p_user_agent: String(device).slice(0, 64),
  })

  if (error) {
    return { error: toErrorKey('savePushSubscription', error) }
  }
  return { error: null }
}

// Whether this device's subscription is the signed-in student's, and in
// which language. null: not theirs (or not saved at all).
export async function getMyPushSubscription(endpoint: string): Promise<{ locale: string } | null> {
  if (!isEndpoint(endpoint)) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('push_subscriptions')
    .select('locale')
    .eq('endpoint', endpoint)
    .maybeSingle()

  return data ? { locale: data.locale } : null
}

// Turning notifications off on this device.
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!isEndpoint(endpoint)) return { error: 'generic' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  if (error) {
    return { error: toErrorKey('deletePushSubscription', error) }
  }
  return { error: null }
}
