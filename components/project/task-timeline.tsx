import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { formatDate } from '@/lib/date'
import { googleCalendarUrl } from '@/lib/calendar'
import { timelineRows, type TimelineTask } from '@/lib/timeline'

// タイムライン (feature batch 1): every task with a due date as a bar from the
// project's start to its due day, late ones in the error colour, with a
// Google Calendar link per due date. Folded by default.
export async function TaskTimeline({
  tasks,
  start,
  deadline,
  today,
  boardUrl,
}: {
  tasks: TimelineTask[]
  start: string
  deadline: string | null
  today: string
  boardUrl: string
}) {
  const { rows, todayPct } = timelineRows(tasks, start, deadline, today)
  if (rows.length === 0) return null
  const [t, locale] = await Promise.all([getTranslations('timeline'), getLocale() as Promise<Locale>])

  return (
    <details className="rule-card px-3.5 py-3.5">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between font-heading text-[17px] font-bold text-ink">
        {t('heading')}
        <span className="text-[13px] font-normal text-muted">{t('count', { count: rows.length })}</span>
      </summary>
      <ul className="relative mt-2 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-semibold text-ink [overflow-wrap:anywhere]">{r.title}</span>
              <span className={`shrink-0 font-meta ${r.late ? 'font-bold text-error' : 'text-muted'}`}>
                {r.late ? t('late', { date: formatDate(r.due, locale) }) : formatDate(r.due, locale)}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-surface-container" aria-hidden>
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${r.done ? 'bg-status-active' : r.late ? 'bg-error' : 'bg-accent'}`}
                style={{ width: `${r.endPct}%` }}
              />
              {todayPct !== null && <div className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${todayPct}%` }} />}
            </div>
            <a
              href={googleCalendarUrl({ kind: 'due', title: r.title, date: r.due, url: boardUrl })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center self-start text-[13px] text-accent-text underline underline-offset-4"
            >
              {t('addToCalendar')}
            </a>
          </li>
        ))}
      </ul>
      {todayPct !== null && <p className="pt-1 text-xs text-muted">{t('todayLine')}</p>}
    </details>
  )
}
