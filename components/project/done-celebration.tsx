'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TASK_DONE_EVENT, type TaskDoneDetail } from '@/lib/celebrate'

// 目標に届きました (0054). Mounted once in the root layout, so it outlives the
// ＋記録 form, which disappears as soon as its task is done. The form and the
// editor send TASK_DONE_EVENT (celebrateTaskDone in lib/celebrate.ts) when a
// save takes a task to its target.
//
// The moment is the brand's own pod filling up: the peas pop in one by one,
// the last one Penna (you), the pod swells once and a check stamps down, on a
// Farmer's Market card (done / on track). No confetti, no sound, no points
// (docs/brand.md). It says the same in words, through a polite live region,
// and closes itself after a few seconds. Under reduced motion nothing moves.
const SHOW_MS = 5200

export function DoneCelebration() {
  const t = useTranslations('project.done')
  const [shown, setShown] = useState<{ title: string; key: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent<TaskDoneDetail>).detail
      if (!detail || typeof detail.title !== 'string') return
      setShown({ title: detail.title, key: Date.now() })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setShown(null), SHOW_MS)
    }
    window.addEventListener(TASK_DONE_EVENT, onDone)
    return () => {
      window.removeEventListener(TASK_DONE_EVENT, onDone)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function close() {
    if (timer.current) clearTimeout(timer.current)
    setShown(null)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-8"
    >
      {shown && (
        <div
          key={shown.key}
          className="done-card rule-card tint-olive pointer-events-auto flex w-full max-w-sm items-center gap-4 px-5 py-4 shadow-[0_10px_28px_rgb(31_31_31_/_0.16)]"
        >
          <svg aria-hidden width="64" height="64" viewBox="0 0 100 100" className="shrink-0">
            <rect x="4" y="4" width="92" height="92" rx="26" fill="var(--tint-hudson)" />
            <g transform="translate(-2.2 6.5) rotate(-25 50 50)">
              <g className="done-pod">
                <path d="M10 50 Q50 20 90 50 Q50 80 10 50 Z" fill="var(--ink)" />
                <path d="M89 49 q7 -2 8 -10" fill="none" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
              </g>
              {[30, 44, 58, 72].map((x, i) => (
                <circle
                  key={x}
                  className="done-pea"
                  style={{ animationDelay: `${140 + i * 120}ms` }}
                  cx={x}
                  cy="50"
                  r="6.2"
                  fill={i === 3 ? 'var(--tint-penna)' : 'var(--tint-hudson)'}
                />
              ))}
            </g>
            <g className="done-check" style={{ animationDelay: '760ms' }}>
              <circle cx="78" cy="78" r="17" fill="var(--ink)" stroke="var(--tint-hudson)" strokeWidth="4" />
              <path d="M70 78 l6 6 l11 -12" fill="none" stroke="var(--surface)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[17px] leading-7 font-bold text-ink">{t('title')}</p>
            <p className="text-[13px] leading-6 text-ink [overflow-wrap:anywhere]">{t('body', { title: shown.title })}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface/60"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
