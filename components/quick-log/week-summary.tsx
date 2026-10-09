'use client'

import { useLocale, useTranslations } from 'next-intl'
import { loggedDays, weekTotal } from '@/lib/progress-stats'
import { tokyoWeekStart, tokyoWeekday, APP_TIME_ZONE } from '@/lib/date'
import type { AmountType } from '@/lib/quick-log'
import { useQuickLog } from './quick-log-provider'

const AMOUNT_TYPES: AmountType[] = ['character_count', 'word_count', 'study_hours']
const DAY_MS = 24 * 60 * 60 * 1000

// Home's 今週 card (Prompt 11): what I logged since Monday 00:00 JST, per
// unit, and 今週記録した日 — seven marks, Monday to Sunday, filled on days
// with a log, today outlined. About showing up, not a streak: no counts of
// days in a row and nothing about missed days. Screen readers get one line
// (今週は3日記録しました) instead of the marks. On the ruled page: two 28px
// lines a side and 14 + 14px padding (three lines); on a narrow phone in
// English the marks wrap under the total (five lines).
export function WeekSummary() {
  const { logs, targets, now } = useQuickLog()
  const t = useTranslations('week')
  const tUnits = useTranslations('units')
  const locale = useLocale()

  const parts = AMOUNT_TYPES.flatMap((type) => {
    const total = weekTotal(
      logs
        .filter((l) => targets.get(l.targetId)?.type === type)
        .map((l) => ({ value: l.value, loggedAt: l.loggedAt })),
      now
    )
    return total > 0 ? [tUnits(type, { count: total })] : []
  })
  const days = loggedDays(
    logs.map((l) => ({ value: l.value, loggedAt: l.loggedAt })),
    now
  )
  const count = days.filter(Boolean).length
  const today = tokyoWeekday(now)
  const monday = tokyoWeekStart(now).getTime()
  // 月 火 水 … / M T W …, from the locale (noon, so the Tokyo date is certain).
  const dayFormat = new Intl.DateTimeFormat(locale, { timeZone: APP_TIME_ZONE, weekday: 'narrow' })
  const labels = days.map((_, i) => dayFormat.format(new Date(monday + i * DAY_MS + 12 * 60 * 60 * 1000)))

  return (
    <section
      aria-labelledby="week-heading"
      className="rule-card flex flex-wrap items-start justify-between gap-x-3 px-3.5 py-3.5"
    >
      <div className="flex min-w-0 flex-col">
        <h2 id="week-heading" className="text-xs leading-7 text-muted">
          {t('heading')}
        </h2>
        <p className="font-meta leading-7 text-ink">
          {parts.length === 0 ? (
            // leading-none like the totals: a 14px span with its own 28px line
            // inside the 16px one made the line 28.8px, and the card 84.8.
            <span className="text-sm leading-none text-muted">{t('nothingYet')}</span>
          ) : (
            parts.map((part, i) => (
              <span key={part} className={i === 0 ? 'text-lg leading-none font-bold whitespace-nowrap' : 'ml-1.5 font-body text-[13px] leading-none whitespace-nowrap text-muted'}>
                {i === 0 ? t('first', { amount: part }) : t('more', { amount: part })}
              </span>
            ))
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <ol aria-hidden className="flex h-7 items-center gap-1.5">
          {days.map((logged, i) => (
            <li key={i} className="flex flex-col items-center gap-0.5 text-[10px] leading-none text-muted">
              <span
                className={`size-3.5 rounded-full border-[1.5px] ${
                  logged ? 'border-status-active bg-status-active' : 'border-[#b9a57c]'
                } ${i === today ? 'outline-2 outline-offset-[1.5px] outline-ink' : ''}`}
              />
              {labels[i]}
            </li>
          ))}
        </ol>
        <p className="text-[11px] leading-7 text-muted">{count === 0 ? t('daysNone') : t('daysLogged', { count })}</p>
      </div>
    </section>
  )
}
