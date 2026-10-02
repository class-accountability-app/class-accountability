import { isIOS } from '@/lib/install-hint'

// What 声かけの通知 can do in this browser (設定's row and the 声かけ card).
// Pure, so every case is unit-tested; the browser facts come from the caller.
//
// - ios-install-first: iPhone/iPad outside the installed app. Safari only
//   offers push to a web app added to the home screen (iOS 16.4+), so say
//   to add it first.
// - unsupported: no service worker or Push API (an in-app browser, or a dev
//   build, where the worker isn't registered), or no VAPID key configured.
// - denied: the student blocked notifications; only the phone's or
//   browser's settings can undo that.
// - available: the switch works.
export type PushState = 'ios-install-first' | 'unsupported' | 'denied' | 'available'

export type PushEnv = {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  permission: NotificationPermission | null
  hasVapidKey: boolean
}

export function getPushState(env: PushEnv): PushState {
  const pushApi = env.hasServiceWorker && env.hasPushManager && env.hasNotification
  if (!pushApi && !env.standalone && isIOS(env.userAgent, env.maxTouchPoints)) return 'ios-install-first'
  if (!pushApi || !env.hasVapidKey) return 'unsupported'
  if (env.permission === 'denied') return 'denied'
  return 'available'
}

// A short label for the device, e.g. 'Safari · iPhone', saved instead of the
// full user agent (less to identify the device by). At most 64 characters.
export function deviceLabel(userAgent: string, maxTouchPoints: number): string {
  const browser = /Edg(e|A|iOS)?\//.test(userAgent)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser'

  const system = /iPhone|iPod/.test(userAgent)
    ? 'iPhone'
    : isIOS(userAgent, maxTouchPoints)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux|CrOS/.test(userAgent)
              ? 'Linux'
              : 'Other'

  return `${browser} · ${system}`
}

// The VAPID public key (base64url) as the bytes pushManager.subscribe wants.
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
