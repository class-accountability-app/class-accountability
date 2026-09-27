'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { StatusStamp } from '@/components/status-stamp'
import { useQuickLog } from './quick-log-provider'

export type Announcement = { text: string; urgent: boolean; key: number }

// Screen readers hear toasts through these two regions. They are always in
// the page and start empty, so every new text is announced; the text sits in
// a span keyed by the toast, so the same message twice is a new node and is
// announced twice.
export function LiveAnnouncer({ announcement }: { announcement: Announcement | null }) {
  return (
    <>
      <div role="status" className="sr-only">
        {announcement && !announcement.urgent && <span key={announcement.key}>{announcement.text}</span>}
      </div>
      <div role="alert" className="sr-only">
        {announcement?.urgent && <span key={announcement.key}>{announcement.text}</span>}
      </div>
    </>
  )
}

// How long a toast stays. One with 取り消す stays about 6 seconds, and the
// timer pauses while it is hovered or focused; the same log can also be
// deleted from あなたの最近の記録 at any time. Errors stay until closed.
const LOGGED_MS = 6000
const INFO_MS = 4000

// Where a toast sits in the tab order: rendered right after the control that
// caused it (see Toast.anchor), but drawn at the top of the screen like
// screen 09. Its text is announced by LiveAnnouncer, not by this element.
export function ToastSlot({ anchor }: { anchor: string }) {
  const { toast, dismissToast, undo, retry } = useQuickLog()
  const t = useTranslations('quickLog.toast')
  const tErrors = useTranslations('errors')
  const rootRef = useRef<HTMLDivElement>(null)
  const remaining = useRef(0)
  const startedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Paused while hovered or focused; kept per toast, so a new one starts
  // running.
  const [paused, setPausedState] = useState({ key: 0, hover: false, focus: false })

  const mine = toast && toast.anchor === anchor ? toast : null
  const setPaused = (patch: { hover?: boolean; focus?: boolean }) =>
    setPausedState((p) => {
      const base = p.key === mine?.key ? p : { key: mine?.key ?? 0, hover: false, focus: false }
      return { ...base, ...patch }
    })
  const duration = !mine ? 0 : mine.kind === 'logged' ? LOGGED_MS : mine.kind === 'info' ? INFO_MS : 0

  // A new toast starts a fresh countdown.
  useEffect(() => {
    remaining.current = duration
  }, [mine?.key, duration])

  const isPaused = paused.key === mine?.key && (paused.hover || paused.focus)
  useEffect(() => {
    if (!mine || duration === 0 || isPaused) return
    startedAt.current = Date.now()
    timer.current = setTimeout(dismissToast, remaining.current)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
    }
  }, [mine, duration, isPaused, dismissToast])

  if (!mine) return null

  const openerFor = () => rootRef.current?.parentElement?.querySelector<HTMLElement>('[data-quick-log-opener]') ?? null

  return (
    <div
      ref={rootRef}
      key={mine.key}
      data-testid="quick-toast"
      onMouseEnter={() => setPaused({ hover: true })}
      onMouseLeave={() => setPaused({ hover: false })}
      onFocus={() => setPaused({ focus: true })}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused({ focus: false })
      }}
      className="quick-toast fixed inset-x-4 top-[72px] z-40 mx-auto flex max-w-md items-center gap-3 rounded-[2px] bg-ink px-4 py-3.5 text-[#fbf6ea] shadow-[0_4px_16px_rgba(58,47,34,0.25)]"
    >
      {mine.kind === 'error' ? (
        <>
          <p className="flex-1 text-sm leading-[1.6]">{tErrors(mine.error)}</p>
          {mine.retry && (
            <button
              type="button"
              data-toast-action
              onClick={() => retry(mine.retry!, openerFor())}
              className="min-h-11 shrink-0 px-1 text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbf6ea]"
            >
              {t('retry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              dismissToast()
              openerFor()?.focus()
            }}
            className="min-h-11 shrink-0 px-1 text-[15px] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbf6ea]"
          >
            {t('dismiss')}
          </button>
        </>
      ) : (
        <>
          <StatusStamp status="active" />
          <div className="flex flex-1 flex-col">
            <p className="text-[15px] leading-[1.5]">{mine.text}</p>
            {mine.kind === 'logged' && mine.shared && (
              <p className="text-xs leading-[1.6] text-[#fbf6ea]/80">{t('shared')}</p>
            )}
          </div>
          {mine.kind === 'logged' && (
            <button
              type="button"
              data-toast-action
              onClick={() => undo(mine.clientId)}
              className="min-h-11 shrink-0 px-1 text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbf6ea]"
            >
              {t('undo')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
