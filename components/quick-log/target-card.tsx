'use client'

import { useTranslations } from 'next-intl'
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

// ＋記録 (or 完了にする for a task, hidden once it's done). The visible text
// starts the accessible name; the target's title follows for screen readers.
export function LogButton({ targetId }: { targetId: string }) {
  const { targets, totalFor, openCreate } = useQuickLog()
  const t = useTranslations('quickLog')
  const target = targets.get(targetId)
  if (!target || isTaskDone(target, totalFor(targetId))) return null
  const isTask = target.type === 'task'

  return (
    <button
      type="button"
      data-quick-log-opener
      onClick={(e) => openCreate(targetId, e.currentTarget)}
      className="btn inline-flex h-11 shrink-0 items-center justify-center rounded-[2px] bg-accent px-3.5 text-[15px] font-semibold text-white"
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

// One of my targets (screen 09's card): title, class and deadline, ＋記録,
// the current label and bar. The toast for a log made here renders right
// after the button in the tab order.
export function TargetCard({ targetId, meta }: { targetId: string; meta: string }) {
  const { targets } = useQuickLog()
  const target = targets.get(targetId)
  if (!target) return null

  return (
    <li
      data-anchor={targetAnchor(targetId)}
      className="flex flex-col gap-2 rounded-[2px] border border-border bg-surface px-[18px] py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-heading text-lg font-bold text-ink [overflow-wrap:anywhere]">
            {target.title}
          </h3>
          <span className="font-meta text-xs text-muted">{meta}</span>
        </div>
        <LogButton targetId={targetId} />
        <ToastSlot anchor={targetAnchor(targetId)} />
      </div>
      <TargetProgress targetId={targetId} />
    </li>
  )
}
