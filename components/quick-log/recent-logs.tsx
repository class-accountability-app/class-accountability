'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { formatDateTime } from '@/lib/date'
import { RECENT_ANCHOR, useQuickLog, type MyLog } from './quick-log-provider'
import { ToastSlot } from './toast'

const RECENT_LOG_LIMIT = 10

// Screen 11's あなたの最近の記録: my own logs in this class, newest first,
// with 編集 and 削除. Only my own logs are in the provider, so only they get
// these controls. 削除 asks first, in place, and says when comments go too.
export function RecentLogs() {
  const { logs, targets, openEdit, remove } = useQuickLog()
  const t = useTranslations('quickLog.recent')
  const tUnits = useTranslations('units')
  const locale = useLocale() as Locale
  const [confirming, setConfirming] = useState<string | null>(null)
  const shown = logs.slice(0, RECENT_LOG_LIMIT)

  function amount(log: MyLog): string {
    const target = targets.get(log.targetId)
    if (!target) return ''
    if (target.type === 'task') return t('taskDone', { title: target.title })
    // A writing session can end with fewer characters than it began
    // (deleted text, Prompt 12): −30字, not +-30字.
    return log.value < 0
      ? t('amountMinus', { amount: tUnits(target.type, { count: -log.value }) })
      : t('amount', { amount: tUnits(target.type, { count: log.value }) })
  }

  return (
    <section data-anchor={RECENT_ANCHOR} aria-labelledby="recent-logs-heading" className="flex w-full max-w-md flex-col gap-3">
      <h2
        id="recent-logs-heading"
        tabIndex={-1}
        data-focus-fallback
        className="font-heading text-xl font-bold text-ink focus:outline-none"
      >
        {t('heading')}
      </h2>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col rounded-[2px] border border-border bg-surface px-[18px]">
          {shown.map((log, i) => (
            <LogRow
              key={log.id}
              log={log}
              amount={amount(log)}
              locale={locale}
              isLast={i === shown.length - 1}
              confirming={confirming === log.id}
              onConfirm={(on) => setConfirming(on ? log.id : null)}
              onEdit={(el) => openEdit(log.id, el)}
              onDelete={() => {
                setConfirming(null)
                remove(log.id)
              }}
            />
          ))}
        </ul>
      )}
      <ToastSlot anchor={RECENT_ANCHOR} />
    </section>
  )
}

function LogRow({
  log,
  amount,
  locale,
  isLast,
  confirming,
  onConfirm,
  onEdit,
  onDelete,
}: {
  log: MyLog
  amount: string
  locale: Locale
  isLast: boolean
  confirming: boolean
  onConfirm: (on: boolean) => void
  onEdit: (el: HTMLElement) => void
  onDelete: () => void
}) {
  const t = useTranslations('quickLog.recent')
  const deleteRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const pending = log.id.startsWith('pending:')
  const when = formatDateTime(log.loggedAt, locale)

  // Into the confirm step: focus やめる (the safe choice). Out of it without
  // deleting: back to 削除.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (wasConfirming.current) deleteRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  return (
    <li className={`flex flex-col gap-2 py-3.5 ${isLast ? '' : 'border-b border-dashed border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold text-ink">{amount}</span>
          <span className="font-meta text-xs text-muted [overflow-wrap:anywhere]">
            {log.description ? t('meta', { when, memo: log.description }) : when}
          </span>
          {log.fromEditor && <span className="text-xs text-muted">{t('fromEditor')}</span>}
        </div>
        {/* The editor's rows change only with the text (0019 refuses an edit
            or delete), so they get no 編集 or 削除. */}
        {!pending && !confirming && !log.fromEditor && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={(e) => onEdit(e.currentTarget)}
              className="min-h-11 px-2 text-[15px] font-semibold text-accent-text underline underline-offset-4"
            >
              {t('edit')}
              <span className="sr-only">：{when}</span>
            </button>
            <button
              ref={deleteRef}
              type="button"
              onClick={() => onConfirm(true)}
              className="min-h-11 px-2 text-[15px] text-muted underline underline-offset-4"
            >
              {t('delete')}
              <span className="sr-only">：{when}</span>
            </button>
          </div>
        )}
      </div>
      {confirming && (
        <div
          role="group"
          aria-labelledby={`confirm-${log.id}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onConfirm(false)
          }}
          className="flex flex-col gap-2 rounded-[2px] border border-accent-text bg-page-bg p-3"
        >
          <p id={`confirm-${log.id}`} className="text-sm text-ink">
            {t('confirm')}
            {log.commentCount > 0 && <> {t('confirmComments', { count: log.commentCount })}</>}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="btn inline-flex h-11 items-center rounded-[2px] bg-accent px-4 text-sm font-semibold text-white"
            >
              {t('confirmYes')}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onConfirm(false)}
              className="inline-flex h-11 items-center rounded-[2px] border border-ink bg-surface px-4 text-sm font-semibold text-ink"
            >
              {t('confirmNo')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
