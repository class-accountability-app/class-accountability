'use client'

import { createContext, useContext, useOptimistic, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatTimeAgo } from '@/lib/date'
import type { Locale } from '@/i18n/config'

export type NudgeItem = {
  id: string
  from_user_id: string
  to_user_id: string
  content: string | null
  created_at: string
}

// A sent nudge shows in the list at once instead of after the server round
// trip. useOptimistic keeps it only while the send is in flight: when the
// action finishes, the page's fresh server data (with the real row) takes
// over; if the send fails (e.g. the nudge limit), it disappears again.
const AddNudge = createContext<(nudge: NudgeItem) => void>(() => {})
const Nudges = createContext<NudgeItem[]>([])

export function NudgeListProvider({
  nudges,
  children,
}: {
  nudges: NudgeItem[]
  children: ReactNode
}) {
  const [optimistic, addOptimistic] = useOptimistic(nudges, (list, nudge: NudgeItem) => [
    nudge,
    ...list,
  ])
  return (
    <AddNudge.Provider value={addOptimistic}>
      <Nudges.Provider value={optimistic}>{children}</Nudges.Provider>
    </AddNudge.Provider>
  )
}

// Call inside the same transition as the server action.
export function useAddNudge() {
  return useContext(AddNudge)
}

export function NudgeList({ names, unknownName }: { names: Record<string, string>; unknownName: string }) {
  const t = useTranslations('nudges')
  const locale = useLocale() as Locale
  const nudges = useContext(Nudges)
  const now = new Date()
  const nameOf = (id: string) => names[id] ?? unknownName

  if (nudges.length === 0) {
    return <p className="text-sm text-muted">{t('empty')}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {nudges.map((n) => (
        <li
          key={n.id}
          className="flex flex-col gap-1 rounded-[2px] border border-border bg-surface px-4 py-3"
        >
          <span className="text-xs text-ink">
            {t.rich('line', {
              from: nameOf(n.from_user_id),
              to: nameOf(n.to_user_id),
              content: n.content ?? '',
              sender: (chunks) => <span className="font-medium text-accent-text">{chunks}</span>,
              recipient: (chunks) => <span className="font-medium">{chunks}</span>,
            })}
          </span>
          <span className="font-meta text-[10px] text-muted">
            {formatTimeAgo(n.created_at, locale, now)}
          </span>
        </li>
      ))}
    </ul>
  )
}
