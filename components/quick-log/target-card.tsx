'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { formatDate } from '@/lib/date'
import { percentOf } from '@/lib/quick-log'
import { daysLeft, nextMilestone, pace, weekTotal } from '@/lib/progress-stats'
import { ProgressBar } from '@/components/progress-bar'
import { StatusStamp } from '@/components/status-stamp'
import { targetAnchor, useQuickLog, type QuickTarget } from './quick-log-provider'
import { ToastSlot } from './toast'

// The current label and bar for one of my targets, from the provider's
// (optimistic) logs, so they move the moment 記録する is pressed.
export function TargetProgress({ targetId }: { targetId: string }) {
  const { targets, totalFor } = useQuickLog()
  const tAmounts = useTranslations('amounts')
  const tUnits = useTranslations('units')
  const tProgress = useTranslations('progress')
  const target = targets.get(targetId)
  if (!target) return null
  const total = totalFor(targetId)

  if (target.type === 'task') {
    return <span className="text-xs text-muted">{total >= 1 ? tProgress('done') : tProgress('notDone')}</span>
  }
  const line =
    target.targetAmount === null
      ? tUnits(target.type, { count: total })
      : tAmounts(target.type, { logged: total, target: target.targetAmount })
  return (
    <>
      <span className="text-xs text-muted">{line}</span>
      {target.targetAmount !== null && (
        <ProgressBar value={total} max={target.targetAmount} valueText={line} />
      )}
    </>
  )
}

export function isTaskDone(target: QuickTarget, total: number) {
  return target.type === 'task' && total >= 1
}

export function isFinished(target: QuickTarget, total: number) {
  return target.type === 'task'
    ? total >= 1
    : target.targetAmount !== null && total >= target.targetAmount
}

export function writePath(target: QuickTarget) {
  return `/classes/${target.classId}/targets/${target.id}/write`
}

// ＋記録 (or 完了にする for a task, hidden once it's done). The visible text
// starts the accessible name; the target's title follows for screen readers.
// A 「Study Pods で書く」 target gets 書く instead, a link to its editor
// (Prompt 12), in the same place and look: it is that card's one action.
export function LogButton({ targetId }: { targetId: string }) {
  const { targets, totalFor, openCreate } = useQuickLog()
  const t = useTranslations('quickLog')
  const target = targets.get(targetId)
  if (!target || isTaskDone(target, totalFor(targetId))) return null
  const isTask = target.type === 'task'

  if (target.inputMode === 'document') {
    return (
      <Link
        href={writePath(target)}
        className="btn inline-flex h-11 shrink-0 items-center justify-center rounded-[2px] bg-accent px-3.5 text-[15px] font-semibold text-white"
      >
        {t('write')}
        <span className="sr-only">：{target.title}</span>
      </Link>
    )
  }

  return (
    <button
      type="button"
      data-quick-log-opener
      onClick={(e) => openCreate(targetId, e.currentTarget)}
      className={`btn inline-flex h-11 shrink-0 items-center justify-center rounded-[2px] px-3.5 text-[15px] font-semibold ${
        isTask ? 'border border-[#b9a57c] bg-[#fffdf7] text-ink shadow-none' : 'bg-accent text-white'
      }`}
    >
      {isTask ? t('complete') : t('open')}
      <span className="sr-only">：{target.title}</span>
    </button>
  )
}

// My own stamp in the pod view: it stamps down again with every log.
export function MyStamp({ status }: { status: 'active' | 'stale' }) {
  const { stampKey } = useQuickLog()
  return <StatusStamp key={stampKey} status={stampKey > 0 ? 'active' : status} />
}

// A deadline this close turns 残り○日 accent-coloured, with an icon; the
// words carry the meaning, not the colour.
const URGENT_DAYS = 3

// One of my targets (screen 09's card, redesigned in Prompt 11): title, class
// and deadline with 残り○日, ＋記録, then the numbers, the bar with its
// 25/50/75 ticks, 今週 +○, あと○, the pace and the next tick. A task is
// simpler: done or not, and its deadline. All of it comes from the
// provider's (optimistic) logs, so it moves the moment 記録する is pressed.
// The toast for a log made here renders right after the button in the tab
// order. On the ruled page (globals.css): every line inside is 28px and the
// padding 14 + 14, so the card is always a whole number of lines tall.
export function TargetCard({ targetId, showClass = false }: { targetId: string; showClass?: boolean }) {
  const { targets, totalFor, now } = useQuickLog()
  const t = useTranslations('targetCard')
  const tProgress = useTranslations('progress')
  const locale = useLocale() as Locale
  const target = targets.get(targetId)
  if (!target) return null

  const total = totalFor(targetId)
  const finished = isFinished(target, total)
  const left = daysLeft(target.deadline, now)

  const deadlineParts: { text: string; urgent?: boolean }[] = []
  if (target.deadline === null) {
    deadlineParts.push({ text: t('noDeadline') })
  } else if (left === 0) {
    deadlineParts.push({ text: t('dueToday'), urgent: !finished })
  } else {
    deadlineParts.push({ text: t('due', { date: formatDate(target.deadline, locale) }) })
    if (!finished && left !== null && left > 0) {
      deadlineParts.push({ text: t('daysLeft', { count: left }), urgent: left <= URGENT_DAYS })
    }
    if (!finished && left !== null && left < 0) deadlineParts.push({ text: t('overdue') })
  }

  return (
    <li
      data-anchor={targetAnchor(targetId)}
      className="rule-card flex flex-col px-3.5 py-3.5 lg:px-[18px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-[17px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">
            {target.title}
          </h3>
          <span className="font-meta text-xs leading-7 text-muted">
            {showClass && target.className && <>{target.className} · </>}
            {deadlineParts.map((part, i) => (
              <span key={part.text}>
                {i > 0 && ' · '}
                {part.urgent ? (
                  <span className="font-bold whitespace-nowrap text-accent-text">
                    <svg
                      aria-hidden
                      className="mr-1 inline align-[-2px]"
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <circle cx="7" cy="7" r="6" />
                      <path d="M7 3.8v4M7 9.6v.6" />
                    </svg>
                    {part.text}
                  </span>
                ) : (
                  part.text
                )}
              </span>
            ))}
          </span>
        </div>
        <LogButton targetId={targetId} />
        <ToastSlot anchor={targetAnchor(targetId)} />
      </div>
      {target.type === 'task' ? (
        <span className="text-sm leading-7 text-muted">{finished ? tProgress('done') : tProgress('notDone')}</span>
      ) : (
        <NumericProgress target={target} total={total} finished={finished} />
      )}
    </li>
  )
}

function NumericProgress({ target, total, finished }: { target: QuickTarget; total: number; finished: boolean }) {
  const { logs, now } = useQuickLog()
  const t = useTranslations('targetCard')
  const tUnits = useTranslations('units')
  const tAmounts = useTranslations('amounts')
  const locale = useLocale() as Locale
  if (target.type === 'task') return null
  const type = target.type
  const amount = (count: number) => tUnits(type, { count })

  // 今週 +○ only when it's more than nothing (a document's week can be
  // negative after deleting text, Prompt 12).
  const week = weekTotal(
    logs.filter((l) => l.targetId === target.id).map((l) => ({ value: l.value, loggedAt: l.loggedAt })),
    now
  )
  const weekLine = week > 0 && (
    <span className="font-meta text-[13px] leading-7 font-bold whitespace-nowrap text-[#556b40]">{t('week', { amount: amount(week) })}</span>
  )

  if (target.targetAmount === null) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <b className="font-meta text-lg leading-7 text-ink">
          <span className="leading-none">{amount(total)}</span>
        </b>
        {weekLine}
      </div>
    )
  }

  const p = pace({ type, total, target: target.targetAmount, deadline: target.deadline, now })
  const next = nextMilestone(total, target.targetAmount)
  const hints: string[] = []
  if (finished) {
    hints.push(t('done'))
  } else {
    hints.push(t('remaining', { amount: amount(target.targetAmount - total) }))
    if (p.kind === 'perDay') {
      hints.push(p.today ? t('paceToday', { amount: amount(p.amount) }) : t('pace', { amount: amount(p.amount) }))
    }
    if (next) hints.push(t('next', { amount: amount(next.remaining), percent: next.percent }))
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <span className="font-meta leading-7 whitespace-nowrap text-ink">
          <b className="text-lg leading-none">{new Intl.NumberFormat(locale).format(total)}</b>{' '}
          <span className="text-[13px] leading-none text-muted">/ {amount(target.targetAmount)}</span>
        </span>
        {weekLine}
      </div>
      <div className="flex h-7 items-center">
        <ProgressBar
          value={total}
          max={target.targetAmount}
          ticks
          valueText={t('barLabel', {
            progress: tAmounts(type, { logged: total, target: target.targetAmount }),
            percent: percentOf(total, target.targetAmount),
          })}
        />
      </div>
      <p className="flex flex-wrap gap-x-2.5 text-[13px] leading-7 text-muted">
        {hints.map((hint) => (
          <span key={hint}>{hint}</span>
        ))}
      </p>
    </>
  )
}

// 完了した目標（n）: finished targets, folded away at the bottom of the list.
export function FinishedTargets({ targetIds, showClass = false }: { targetIds: string[]; showClass?: boolean }) {
  const t = useTranslations('targetCard')
  if (targetIds.length === 0) return null
  return (
    <details className="rule-card group px-3.5">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {t('finished', { count: targetIds.length })}
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted group-open:rotate-180"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      <ul className="flex flex-col gap-7 pb-7">
        {targetIds.map((id) => (
          <TargetCard key={id} targetId={id} showClass={showClass} />
        ))}
      </ul>
    </details>
  )
}

// Phones (under 768px), on Home and the class page: ＋記録 for the most
// urgent unfinished target, fixed above the tab bar and clear of the home
// indicator. The spacer keeps the end of the page scrollable past it. It
// steps aside while the quick-log sheet is open, and stays still during page
// transitions (.sticky-log in globals.css).
export function StickyLog({ targetId }: { targetId: string | null }) {
  const { targets, totalFor, openCreate, sheetOpen } = useQuickLog()
  const t = useTranslations('quickLog')
  const target = targetId ? targets.get(targetId) : undefined
  if (!target || isFinished(target, totalFor(target.id))) return null
  const isTask = target.type === 'task'
  const buttonClass =
    'btn flex h-12 w-full items-center justify-center rounded-[2px] bg-accent px-4 text-base font-semibold text-white'

  return (
    <>
      <div aria-hidden className="h-16 shrink-0 md:hidden" />
      <div
        className={`sticky-log fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom)+10px)] z-10 px-[max(1rem,env(safe-area-inset-left))] md:hidden ${
          sheetOpen ? 'hidden' : ''
        }`}
      >
        {target.inputMode === 'document' ? (
          // 続きを書く：… (Prompt 12): the editor instead of the sheet.
          <Link href={writePath(target)} className={buttonClass}>
            <span className="truncate">{t('stickyWrite', { title: target.title })}</span>
          </Link>
        ) : (
          <button
            type="button"
            data-quick-log-opener
            onClick={(e) => openCreate(target.id, e.currentTarget)}
            className={buttonClass}
          >
            <span className="truncate">{t(isTask ? 'stickyComplete' : 'stickyOpen', { title: target.title })}</span>
          </button>
        )}
      </div>
    </>
  )
}
