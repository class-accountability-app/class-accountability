'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { isStandalone } from '@/components/pwa'
import { base64UrlToBytes, deviceLabel, getPushState, type PushState } from '@/lib/push-support'
import { deletePushSubscription, getMyPushSubscription, savePushSubscription } from '@/lib/push-actions'

// 声かけの通知 in the browser: whether this device can and does receive
// nudge pushes, and turning them on and off. Push needs the service worker,
// which components/pwa.tsx registers in production builds only.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const WORKER_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export function detectPushState(): PushState {
  return getPushState({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: isStandalone(),
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
    hasVapidKey: VAPID_PUBLIC_KEY.length > 0,
  })
}

// This browser's subscription, if any. Never waits for a worker that isn't
// there (the dev server has none).
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

// Once per page load: is this browser's subscription the signed-in
// student's? If it isn't (the previous student on a shared phone, whose
// session expired instead of signing out), unsubscribe it, so their nudges
// stop arriving here. If the student's language changed, save it again so
// the next push is in the new language.
let syncResult: Promise<boolean> | null = null

async function syncThisDevice(locale: string): Promise<boolean> {
  const subscription = await currentSubscription()
  if (!subscription) return false

  const mine = await getMyPushSubscription(subscription.endpoint)
  if (!mine) {
    await subscription.unsubscribe().catch(() => {})
    return false
  }
  if (mine.locale !== locale) {
    await savePushSubscription(subscription.toJSON(), deviceLabel(navigator.userAgent, navigator.maxTouchPoints))
  }
  return true
}

function syncOnce(locale: string): Promise<boolean> {
  syncResult ??= syncThisDevice(locale).catch(() => false)
  return syncResult
}

// Mounted in the root layout for signed-in students.
export function PushSync() {
  const locale = useLocale()
  useEffect(() => {
    if (detectPushState() === 'available') void syncOnce(locale)
  }, [locale])
  return null
}

export type PushDevice = { state: PushState; on: boolean }

// null until checked in the browser (and on the server).
export function usePushDevice(): [PushDevice | null, (device: PushDevice) => void] {
  const locale = useLocale()
  const [device, setDevice] = useState<PushDevice | null>(null)

  useEffect(() => {
    let cancelled = false
    const state = detectPushState()
    const check = state === 'available' ? syncOnce(locale) : Promise.resolve(false)
    check.then((on) => {
      if (!cancelled) setDevice({ state, on })
    })
    return () => {
      cancelled = true
    }
  }, [locale])

  return [device, setDevice]
}

export type TurnOnResult = 'on' | 'dismissed' | 'denied' | 'failed'

// Call straight from the tap: iOS only shows the permission prompt when it is
// asked for inside the tap itself, so nothing is awaited before it.
export async function turnOnPush(): Promise<TurnOnResult> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'dismissed'

  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, WORKER_TIMEOUT_MS)
    // A subscription made with an older key can't be reused; start fresh.
    const old = await registration.pushManager.getSubscription()
    if (old) await old.unsubscribe()

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    })
    const result = await savePushSubscription(
      subscription.toJSON(),
      deviceLabel(navigator.userAgent, navigator.maxTouchPoints)
    )
    if (result.error) {
      await subscription.unsubscribe().catch(() => {})
      return 'failed'
    }
    syncResult = Promise.resolve(true)
    return 'on'
  } catch {
    return 'failed'
  }
}

// Deletes this device's row first, then the browser's subscription.
export async function turnOffPush(): Promise<boolean> {
  try {
    const subscription = await currentSubscription()
    if (subscription) {
      const result = await deletePushSubscription(subscription.endpoint)
      if (result.error) return false
      await subscription.unsubscribe()
    }
    syncResult = Promise.resolve(false)
    return true
  } catch {
    return false
  }
}

// Sign-out and account deletion: drop this browser's subscription, and hand
// back its endpoint so the server can delete the row. Never blocks for long.
export async function releaseThisDevice(): Promise<string | null> {
  try {
    const subscription = await withTimeout(currentSubscription(), 2000)
    if (!subscription) return null
    const endpoint = subscription.endpoint
    await withTimeout(subscription.unsubscribe(), 2000).catch(() => {})
    return endpoint
  } catch {
    return null
  }
}
