'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/client'
import { formatDayAgo } from '@/lib/date'

export type PresenceRow = { user_id: string; last_seen_day: string | null; online: boolean }
type Member = { id: string; name: string; done: number; total: number }

const REFRESH_MS = 60_000

// チームのようす (item F): one row per teammate with the online dot, the day
// they last opened the app and their tasks done. The dot and day come from
// team_presence() (0035), refreshed every minute while the page is visible.
export function TeamTable({
  podId,
  me,
  members,
  initial,
}: {
  podId: string
  me: string
  members: Member[]
  initial: PresenceRow[]
}) {
  const t = useTranslations('teamTable')
  const locale = useLocale() as Locale
  const [rows, setRows] = useState(initial)

  useEffect(() => {
    const supabase = createClient()
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.rpc('team_presence', { p_pod: podId })
      if (data) setRows(data as PresenceRow[])
    }
    const timer = window.setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [podId])

  const byId = new Map(rows.map((r) => [r.user_id, r]))
  const onlineCount = members.filter((m) => byId.get(m.id)?.online).length

  return (
    <section aria-labelledby="team-table-heading" className="rule-card flex flex-col px-3.5 py-3.5">
      <h2 id="team-table-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('heading')}
      </h2>
      <p className="text-[13px] leading-7 text-muted" aria-live="polite">
        {onlineCount > 0 ? t('onlineNow', { count: onlineCount }) : t('onlineNone')}
      </p>
      <table className="mt-1.5 w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="py-1 font-semibold">{t('member')}</th>
            <th scope="col" className="py-1 font-semibold">{t('lastSeen')}</th>
            <th scope="col" className="py-1 text-right font-semibold">{t('tasks')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const row = byId.get(m.id)
            const online = row?.online ?? false
            return (
              <tr key={m.id} className="border-t border-dashed border-border">
                <th scope="row" className="py-2 pr-2 font-semibold text-ink [overflow-wrap:anywhere]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-status-active' : 'bg-border'}`}
                    />
                    {m.id === me ? t('you', { name: m.name }) : m.name}
                    <span className="sr-only">{online ? t('online') : t('offline')}</span>
                  </span>
                </th>
                <td className="py-2 pr-2 text-muted">
                  {online ? (
                    <span className="font-semibold text-status-active">{t('online')}</span>
                  ) : row?.last_seen_day ? (
                    formatDayAgo(row.last_seen_day, locale)
                  ) : (
                    t('never')
                  )}
                </td>
                <td className="py-2 text-right font-meta text-ink">
                  {m.total === 0 ? '—' : t('taskCount', { done: m.done, total: m.total })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="pt-1.5 text-xs leading-6 text-muted">{t('note')}</p>
    </section>
  )
}
