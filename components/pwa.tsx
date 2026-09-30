'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getInstallHint, type InstallHint } from '@/lib/install-hint'

// The installed-app plumbing, mounted once in the root layout:
// - registers /sw.js in production builds (next start on localhost too);
//   in development it removes any worker left over from a production run,
//   so the dev server's hot reload isn't served stale files;
// - catches the browser's install prompt (beforeinstallprompt) as early as
//   possible, so 設定's button can use it later.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function PwaSupport() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
          // No worker means no offline page; the app itself still works.
        })
      } else {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      }
    }

    function onPrompt(event: Event) {
      event.preventDefault() // keep Chrome's own mini-bar away; 設定 offers it instead
      deferredPrompt = event as BeforeInstallPromptEvent
      notify()
    }
    function onInstalled() {
      deferredPrompt = null
      notify()
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return null
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// The hint for this browser. null on the server and during hydration, so the
// row never flashes in and out; then the real answer.
export function useInstallHint(): InstallHint | null {
  return useSyncExternalStore(
    subscribe,
    () =>
      getInstallHint({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: isStandalone(),
        promptAvailable: deferredPrompt !== null,
      }),
    () => null
  )
}

// true while running as the installed app (null on the server).
export function useStandalone(): boolean | null {
  return useSyncExternalStore(subscribe, isStandalone, () => null)
}

// Opens the browser's own install dialog. The event can be used only once.
export async function promptInstall(): Promise<void> {
  const event = deferredPrompt
  if (!event) return
  deferredPrompt = null
  notify()
  await event.prompt()
  await event.userChoice
}
