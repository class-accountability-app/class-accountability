'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { freshSince } from '@/lib/board-activity'

export type ChangeItem = { id: string; at: string; text: string; when: string }

// When this device last had a project's board open. It lives in localStorage:
// it is a per-device convenience, never leaves the phone, and if storage is
// cleared the card simply falls back to the last three days.
const key = (projectId: string) => `sp-board-seen:${projectId}`

// The value as it was when the board opened, kept for as long as the board
// stays open, so the list doesn't empty itself the moment "now" is saved.
const openedWith = new Map<string, string | null>()

function seenWhenOpened(projectId: string): string | null {
  if (!openedWith.has(projectId)) {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(key(projectId))
    } catch {
      // Private mode: treated as a first visit.
    }
    openedWith.set(projectId, stored)
  }
  return openedWith.get(projectId) ?? null
}

function saveSeenNow(projectId: string) {
  try {
    localStorage.setItem(key(projectId), new Date().toISOString())
  } catch {
    // Nothing to do: the same events show again next time.
  }
}

const noSubscribe = () => () => {}
// The server can't know what this device has seen, so it renders no card.
const NOT_YET = 'server'

// 前回から変わったこと (0044), at the top of the board: what teammates did
// since this device last had the board open, so nobody has to ask "what's
// new?" in another app. Only things already visible on the board; my own
// actions are left out on the server. Shows nothing when nothing is new.
export function WhatChanged({ projectId, items }: { projectId: string; items: ChangeItem[] }) {
  const t = useTranslations('whatChanged')
  const seen = useSyncExternalStore(
    noSubscribe,
    () => seenWhenOpened(projectId),
    () => NOT_YET
  )

  useEffect(() => {
    saveSeenNow(projectId)
    // Leaving the board: what I did or saw while here is no longer news.
    return () => {
      saveSeenNow(projectId)
      openedWith.delete(projectId)
    }
  }, [projectId])

  if (seen === NOT_YET) return null
  const fresh = freshSince(items, seen, new Date())
  if (fresh.length === 0) return null
  const shown = fresh.slice(0, 6)

  return (
    <section aria-labelledby="what-changed-heading" className="rule-card flex flex-col px-5 py-5">
      <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('kicker')}</p>
      <h2 id="what-changed-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t(seen ? 'title' : 'titleFirst')}
      </h2>
      <ul className="flex flex-col">
        {shown.map((item) => (
          <li key={item.id} className="flex flex-col border-b border-dashed border-ink/15 py-1.5 last:border-b-0">
            <span className="text-[15px] leading-6 text-ink [overflow-wrap:anywhere]">{item.text}</span>
            <span className="font-meta text-xs leading-5 text-muted">{item.when}</span>
          </li>
        ))}
      </ul>
      {fresh.length > shown.length && (
        <p className="pt-1 font-meta text-xs leading-6 text-muted">{t('more', { count: fresh.length - shown.length })}</p>
      )}
    </section>
  )
}
