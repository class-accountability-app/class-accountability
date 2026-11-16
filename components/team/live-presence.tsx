'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { LEAVE_GRACE_MS, liveMembers, shownMembers, teamTopic, trackLeaves } from '@/lib/live-presence'

// Live presence (0051), for the whole signed-in app (root layout): one private
// Realtime channel per team I'm in, `team:<pod id>`. While a page of the app
// is visible and my 「オンライン表示」 is on, I announce myself on each; I
// always listen. Pages read who is here with useLivePresence(podId), which is
// null while that channel isn't connected (then polling is the answer).
//
// Nothing is stored and nothing but the user id (the presence key) is sent:
// the payload is empty. The database lets only the team's members join, and
// only those with the setting on announce themselves (0051).

type LiveByPod = Record<string, readonly string[] | null>

const LiveContext = createContext<LiveByPod>({})

export function LivePresenceProvider({
  userId,
  podIds,
  share,
  children,
}: {
  userId: string
  podIds: string[]
  share: boolean
  children: React.ReactNode
}) {
  const [byPod, setByPod] = useState<LiveByPod>({})
  // A stable dependency: the list is rebuilt on every render of the layout.
  const podKey = [...podIds].sort().join(',')

  useEffect(() => {
    const pods = podKey ? podKey.split(',') : []
    if (pods.length === 0) return
    const supabase = createClient()
    let cancelled = false
    const channels: RealtimeChannel[] = []
    const subscribed = new Set<RealtimeChannel>()
    const timers = new Set<number>()
    const visible = () => document.visibilityState === 'visible'

    const announce = (channel: RealtimeChannel) => {
      if (!subscribed.has(channel)) return
      if (share && visible()) void channel.track({})
      else void channel.untrack()
    }

    void (async () => {
      // Private channels are authorised with the student's own token.
      await supabase.realtime.setAuth()
      if (cancelled) return
      for (const pod of pods) {
        let live = new Set<string>()
        let leftAt = new Map<string, number>()
        const publish = () => {
          if (!cancelled) setByPod((cur) => ({ ...cur, [pod]: [...shownMembers(live, leftAt, Date.now())] }))
        }
        const channel = supabase.channel(teamTopic(pod), {
          config: { private: true, presence: { key: userId } },
        })
        channel.on('presence', { event: 'sync' }, () => {
          const next = liveMembers(channel.presenceState())
          leftAt = trackLeaves(live, next, leftAt, Date.now())
          live = next
          publish()
          // Show the change once the grace period of whoever just left is over.
          const timer = window.setTimeout(() => {
            timers.delete(timer)
            publish()
          }, LEAVE_GRACE_MS + 250)
          timers.add(timer)
        })
        channel.subscribe((status) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            subscribed.add(channel)
            announce(channel)
            publish()
          } else {
            // TIMED_OUT, CHANNEL_ERROR or CLOSED: polling answers until the
            // client rejoins (it retries by itself).
            subscribed.delete(channel)
            setByPod((cur) => ({ ...cur, [pod]: null }))
          }
        })
        channels.push(channel)
      }
    })()

    // A hidden page is not "here" (the minute ping has always worked this way).
    const onVisibility = () => channels.forEach(announce)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      timers.forEach((timer) => window.clearTimeout(timer))
      for (const channel of channels) void supabase.removeChannel(channel)
    }
  }, [userId, share, podKey])

  return <LiveContext.Provider value={byPod}>{children}</LiveContext.Provider>
}

// Who in this team is here now, or null while its channel isn't connected.
export function useLivePresence(podId: string): ReadonlySet<string> | null {
  const ids = useContext(LiveContext)[podId]
  return ids ? new Set(ids) : null
}
