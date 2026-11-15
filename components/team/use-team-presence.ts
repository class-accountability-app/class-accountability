'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AwayRow, PresenceRow } from '@/lib/team-status'

// How often the team's status is re-read while the page is visible. The
// database counts someone as online for 3 minutes after their last ping (0035).
const REFRESH_MS = 30_000

// The team's presence (0035) and お休み (0049), refreshed every 30 seconds and
// when the page becomes visible again. Starts from what the server rendered.
export function useTeamPresence(podId: string, initial: PresenceRow[], initialAway: AwayRow[]) {
  const [presence, setPresence] = useState(initial)
  const [away, setAway] = useState(initialAway)

  useEffect(() => {
    const supabase = createClient()
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const [{ data }, { data: awayData }] = await Promise.all([
        supabase.rpc('team_presence', { p_pod: podId }),
        supabase.rpc('team_away', { p_pod: podId }),
      ])
      if (data) setPresence(data as PresenceRow[])
      if (awayData) setAway(awayData as AwayRow[])
    }
    const timer = window.setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [podId])

  return { presence, away }
}
