'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const PING_MS = 60_000

// The team's "online now" (0035): while the app is open and visible, tell the
// database once a minute. touch_presence() itself writes at most once every
// 45 seconds (0050), so a reload or a second tab costs nothing extra, and
// someone counts as online for 100 seconds after their last ping.
export function PresencePing() {
  useEffect(() => {
    const supabase = createClient()
    const ping = () => {
      if (document.visibilityState === 'visible') void supabase.rpc('touch_presence')
    }
    ping()
    const timer = window.setInterval(ping, PING_MS)
    document.addEventListener('visibilitychange', ping)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [])
  return null
}
