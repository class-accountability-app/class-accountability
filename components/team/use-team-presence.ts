'use client'

import { createContext, createElement, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AwayRow, PresenceRow } from '@/lib/team-status'
import { applyLive } from '@/lib/live-presence'
import { useLivePresence } from './live-presence'

// How often the team's status is re-read while the page is visible. The
// database counts someone as online for 100 seconds after their last ping
// (0050; 3 minutes before it). While the team's live channel is connected
// (0051, live-presence.tsx) `online` comes from it instead, at once; polling
// still gives the last day opened and お休み.
const REFRESH_MS = 20_000

type TeamPresence = { presence: PresenceRow[]; away: AwayRow[] }

// The team's presence (0035) and お休み (0049), re-read every 20 seconds, when
// the page becomes visible again, when the window gets the focus back and when
// the network returns. Starts from what the server rendered.
function usePolledPresence(podId: string, initial: PresenceRow[], initialAway: AwayRow[], enabled: boolean): TeamPresence {
  const [presence, setPresence] = useState(initial)
  const [away, setAway] = useState(initialAway)

  useEffect(() => {
    if (!enabled) return
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
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [podId, enabled])

  return { presence, away }
}

const TeamPresenceContext = createContext<TeamPresence | null>(null)

// On the board several things show who is here (チームのいま, the mark next to
// each owner's name, チームのようす): this provider reads the team's status
// once for all of them, so they always agree and the database is asked once.
export function TeamPresenceProvider({
  podId,
  initial,
  initialAway,
  children,
}: {
  podId: string
  initial: PresenceRow[]
  initialAway: AwayRow[]
  children: React.ReactNode
}) {
  const polled = usePolledPresence(podId, initial, initialAway, true)
  const live = useLivePresence(podId)
  const value = { presence: applyLive(polled.presence, live), away: polled.away }
  return createElement(TeamPresenceContext.Provider, { value }, children)
}

// Inside a TeamPresenceProvider: the shared status. Outside one (Home): its
// own polling, as before.
export function useTeamPresence(podId: string, initial: PresenceRow[], initialAway: AwayRow[]): TeamPresence {
  const shared = useContext(TeamPresenceContext)
  const own = usePolledPresence(podId, initial, initialAway, shared === null)
  const live = useLivePresence(podId)
  return shared ?? { presence: applyLive(own.presence, live), away: own.away }
}

// For a mark that has no data of its own: null outside a provider.
export function useSharedTeamPresence(): TeamPresence | null {
  return useContext(TeamPresenceContext)
}
