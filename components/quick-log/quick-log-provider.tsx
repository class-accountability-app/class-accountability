'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import type { TargetType } from '@/lib/targets'
import type { ErrorKey } from '@/lib/errors'
import { tidyTotal } from '@/lib/quick-log'
import { milestoneCrossed } from '@/lib/progress-stats'
import {
  deleteLog,
  logProgress,
  updateLog,
  type LogInput,
} from '@/app/classes/[classId]/progress/actions'
import { QuickLogSheet, type SheetState } from './quick-log-sheet'
import { LiveAnnouncer, type Announcement } from './toast'

// Quick log (screens 09, 10, 11): one provider per page holds my targets and
// my logs for them. Every total on the page is summed from these logs, and
// useOptimistic applies a new log, an edit or a delete at once; when the
// server action's revalidation arrives, the real rows replace the optimistic
// ones. If the action fails, React drops the optimistic change by itself.

export type QuickTarget = {
  id: string
  title: string
  type: TargetType
  targetAmount: number | null
  deadline: string | null // 'YYYY-MM-DD', a Tokyo date
  className: string
  inPod: boolean
}

export type MyLog = {
  id: string
  clientId: string | null
  targetId: string
  value: number
  description: string | null
  loggedAt: string
  commentCount: number
}

type Change =
  | { kind: 'add'; log: MyLog }
  | { kind: 'update'; id: string; value: number; description: string | null }
  | { kind: 'remove'; id?: string; clientId?: string }

function applyChange(logs: MyLog[], change: Change): MyLog[] {
  switch (change.kind) {
    case 'add':
      // Once the real row has arrived, the optimistic one is not needed.
      if (logs.some((l) => l.clientId === change.log.clientId)) return logs
      return [change.log, ...logs]
    case 'update':
      return logs.map((l) =>
        l.id === change.id ? { ...l, value: change.value, description: change.description } : l
      )
    case 'remove':
      return logs.filter(
        (l) =>
          !(change.id && l.id === change.id) && !(change.clientId && l.clientId === change.clientId)
      )
  }
}

// What the toast shows. `anchor` is where it sits in the tab order: right
// after the ＋記録 button that logged, or after あなたの最近の記録, so Tab
// from the returned focus reaches 取り消す straight away.
export type Toast =
  | {
      kind: 'logged'
      anchor: string
      key: number
      clientId: string
      text: string
      shared: boolean
      // The log crossed 25/50/75/100% (Prompt 11): the stamp gets a short
      // extra pulse, none under reduced motion.
      milestone?: boolean
      // 取り消す was pressed and the delete is on its way: the button shows
      // 取り消しています…, ignores presses and keeps focus; the toast stays.
      undoing?: boolean
    }
  | { kind: 'info'; anchor: string; key: number; text: string }
  | { kind: 'error'; anchor: string; key: number; error: ErrorKey; retry?: SheetState }

type Opener = HTMLElement | null

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type NewToast = DistributiveOmit<Toast, 'key'>

type QuickLogContext = {
  targets: Map<string, QuickTarget>
  logs: MyLog[]
  totalFor: (targetId: string) => number
  // The server's time when the page was rendered: "this week" and "days
  // left" use it, so the server's HTML and the browser's first render agree.
  now: Date
  // The sticky ＋記録 hides while the sheet is open.
  sheetOpen: boolean
  stampKey: number
  toast: Toast | null
  dismissToast: () => void
  openCreate: (targetId: string, opener: Opener) => void
  openEdit: (logId: string, opener: Opener) => void
  undo: (clientId: string) => void
  remove: (logId: string) => void
  // もう一度 on an error toast: reopens the sheet with what was typed and,
  // for a new log, the same client_id, so the retry can't double-log.
  retry: (state: SheetState, opener: Opener) => void
}

const Context = createContext<QuickLogContext | null>(null)

export function useQuickLog(): QuickLogContext {
  const value = useContext(Context)
  if (!value) throw new Error('useQuickLog needs a QuickLogProvider')
  return value
}

export function targetAnchor(targetId: string) {
  return `target:${targetId}`
}
export const RECENT_ANCHOR = 'recent'

type LogResult = Awaited<ReturnType<typeof logProgress>>

export function QuickLogProvider({
  targets,
  logs: serverLogs,
  now: nowIso,
  children,
}: {
  targets: QuickTarget[]
  logs: MyLog[]
  now: string
  children: ReactNode
}) {
  const t = useTranslations('quickLog')
  const tUnits = useTranslations('units')
  const tAmounts = useTranslations('amounts')
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const tErrors = useTranslations('errors')
  const [, startTransition] = useTransition()
  const [logs, change] = useOptimistic(serverLogs, applyChange)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [stampKey, setStampKey] = useState(0)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const openerRef = useRef<Opener>(null)
  // The insert behind each 取り消す, by client_id.
  const pendingLogs = useRef(new Map<string, Promise<LogResult>>())
  const toastKey = useRef(0)

  const targetMap = useMemo(() => new Map(targets.map((x) => [x.id, x])), [targets])

  const totals = useMemo(() => {
    const sums = new Map<string, number>()
    for (const log of logs) sums.set(log.targetId, (sums.get(log.targetId) ?? 0) + Number(log.value))
    return sums
  }, [logs])
  const totalFor = useCallback((id: string) => tidyTotal(totals.get(id) ?? 0), [totals])

  // Every toast is also read out by the page's live regions: politely for
  // news, as an alert for errors.
  const show = useCallback(
    (next: NewToast, announce?: string) => {
      toastKey.current += 1
      setToast({ ...next, key: toastKey.current } as Toast)
      setAnnouncement(
        next.kind === 'error'
          ? { text: tErrors(next.error), urgent: true, key: toastKey.current }
          : { text: announce ?? next.text, urgent: false, key: toastKey.current }
      )
    },
    [tErrors]
  )

  const dismissToast = useCallback(() => setToast(null), [])

  // Focus rescue. Controls disappear under the keyboard user: 完了にする once
  // a task is done, 取り消す when its toast changes, a deleted row's buttons.
  // A removed element drops focus on <body>, so for a few seconds after an
  // action, whenever that has happened, focus moves to the nearest sensible
  // control in the same place: its ＋記録/完了にする button, else the
  // toast's action, else the section's fallback (a heading).
  const rescue = useRef<{ anchor: string; until: number } | null>(null)
  const guardFocus = useCallback((anchor: string) => {
    rescue.current = { anchor, until: Date.now() + 10_000 }
  }, [])
  const rescueFocus = useCallback(() => {
    const r = rescue.current
    if (!r || Date.now() > r.until) return
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    const root = document.querySelector(`[data-anchor="${CSS.escape(r.anchor)}"]`)
    const next =
      root?.querySelector<HTMLElement>('[data-quick-log-opener]') ??
      root?.querySelector<HTMLElement>('[data-toast-action]') ??
      root?.querySelector<HTMLElement>('[data-focus-fallback]')
    next?.focus()
  }, [])
  useEffect(rescueFocus)

  const focusOpener = useCallback(() => {
    const el = openerRef.current
    if (el?.isConnected) el.focus()
    else rescueFocus()
  }, [rescueFocus])

  const openCreate = useCallback((targetId: string, opener: Opener) => {
    openerRef.current = opener
    setSheet({ mode: 'create', targetId, clientId: crypto.randomUUID(), amount: '', description: '' })
  }, [])

  const openEdit = useCallback(
    (logId: string, opener: Opener) => {
      const log = logs.find((l) => l.id === logId)
      if (!log) return
      openerRef.current = opener
      setSheet({
        mode: 'edit',
        targetId: log.targetId,
        logId,
        amount: String(log.value),
        description: log.description ?? '',
      })
    },
    [logs]
  )

  const retry = useCallback((state: SheetState, opener: Opener) => {
    openerRef.current = opener
    setToast(null)
    setSheet(state)
  }, [])

  // 記録する. The sheet has already checked the amount; the server parses it
  // again. The sheet is closed before this runs, so a second tap has
  // nothing to hit.
  function submitCreate(state: Extract<SheetState, { mode: 'create' }>, value: number) {
    const target = targetMap.get(state.targetId)
    if (!target) return
    const input: LogInput = { amount: state.amount, description: state.description }
    const anchor = targetAnchor(target.id)

    // Crossing 25/50/75/100% says so instead of the plain line.
    const before = totalFor(target.id)
    const after = tidyTotal(before + value)
    const milestone = target.type === 'task' ? null : milestoneCrossed(before, after, target.targetAmount)
    const text =
      target.type === 'task'
        ? t('toast.loggedTask', { title: target.title })
        : milestone !== null && target.targetAmount !== null
          ? t(`toast.milestone.${milestone}`, {
              progress: tAmounts(target.type, { logged: after, target: target.targetAmount }),
            })
          : t('toast.logged', { amount: tUnits(target.type, { count: value }) })
    show(
      {
        kind: 'logged',
        anchor,
        clientId: state.clientId,
        text,
        shared: target.inPod,
        milestone: milestone !== null,
      },
      target.inPod ? `${text}。${t('toast.shared')}` : text
    )
    setStampKey((k) => k + 1)
    guardFocus(anchor)

    startTransition(async () => {
      change({
        kind: 'add',
        log: {
          id: `pending:${state.clientId}`,
          clientId: state.clientId,
          targetId: target.id,
          value,
          description: state.description.trim() || null,
          loggedAt: new Date().toISOString(),
          commentCount: 0,
        },
      })
      const pending = logProgress(target.id, state.clientId, input).catch(
        (): LogResult => ({ error: 'logFailed' })
      )
      pendingLogs.current.set(state.clientId, pending)
      const result = await pending
      if (result.error) {
        pendingLogs.current.delete(state.clientId)
        show({
          kind: 'error',
          anchor,
          error: result.error === 'generic' ? 'logFailed' : result.error,
          retry: state,
        })
      }
    })
  }

  function submitEdit(state: Extract<SheetState, { mode: 'edit' }>, value: number) {
    const input: LogInput = { amount: state.amount, description: state.description }
    guardFocus(RECENT_ANCHOR)
    startTransition(async () => {
      change({ kind: 'update', id: state.logId, value, description: state.description.trim() || null })
      const result = await updateLog(state.logId, input).catch(
        (): { error: ErrorKey } => ({ error: 'generic' })
      )
      if (result.error) {
        show({ kind: 'error', anchor: RECENT_ANCHOR, error: result.error, retry: state })
      } else {
        show({ kind: 'info', anchor: RECENT_ANCHOR, text: t('toast.updated') })
      }
    })
  }

  // 取り消す: the button turns into 取り消しています… at once (a second press
  // does nothing) and keeps focus while the undo waits for the insert, if it
  // is still in flight, and then deletes that log. When the result arrives,
  // 取り消す goes away and focus returns to ＋記録 (for a task, to 完了にする
  // once it reappears).
  const undo = useCallback(
    (clientId: string) => {
      if (toast?.kind === 'logged' && toast.undoing) return
      const pending = pendingLogs.current.get(clientId)
      const anchor = toast?.anchor ?? RECENT_ANCHOR
      const known = logs.find((l) => l.clientId === clientId && !l.id.startsWith('pending:'))?.id
      setToast((current) =>
        current?.kind === 'logged' && current.clientId === clientId ? { ...current, undoing: true } : current
      )
      setAnnouncement({ text: t('toast.undoing'), urgent: false, key: ++toastKey.current })
      guardFocus(anchor)
      startTransition(async () => {
        change({ kind: 'remove', clientId })
        const inserted = pending ? await pending : null
        const id = inserted?.id ?? known
        if (!id) {
          show({ kind: 'error', anchor, error: 'logNotFound' })
          return
        }
        const result = await deleteLog(id).catch((): { error: ErrorKey } => ({ error: 'generic' }))
        pendingLogs.current.delete(clientId)
        if (result.error) {
          show({ kind: 'error', anchor, error: result.error })
        } else {
          show({ kind: 'info', anchor, text: t('toast.undone') })
        }
      })
    },
    [change, guardFocus, logs, show, t, toast]
  )

  // 削除 after its confirm step, on あなたの最近の記録. The row goes away, so
  // focus moves to the section heading.
  const remove = useCallback(
    (logId: string) => {
      guardFocus(RECENT_ANCHOR)
      startTransition(async () => {
        change({ kind: 'remove', id: logId })
        const result = await deleteLog(logId).catch((): { error: ErrorKey } => ({ error: 'generic' }))
        if (result.error) {
          show({ kind: 'error', anchor: RECENT_ANCHOR, error: result.error })
        } else {
          show({ kind: 'info', anchor: RECENT_ANCHOR, text: t('toast.deleted') })
        }
      })
    },
    [change, guardFocus, show, t]
  )

  const value = useMemo<QuickLogContext>(
    () => ({
      targets: targetMap,
      logs,
      totalFor,
      now,
      sheetOpen: sheet !== null,
      stampKey,
      toast,
      dismissToast,
      openCreate,
      openEdit,
      undo,
      remove,
      retry,
    }),
    [targetMap, logs, totalFor, now, sheet, stampKey, toast, dismissToast, openCreate, openEdit, undo, remove, retry]
  )

  return (
    <Context.Provider value={value}>
      {children}
      <QuickLogSheet
        state={sheet}
        target={sheet ? (targetMap.get(sheet.targetId) ?? null) : null}
        total={sheet ? totalFor(sheet.targetId) : 0}
        editedValue={sheet?.mode === 'edit' ? (logs.find((l) => l.id === sheet.logId)?.value ?? 0) : 0}
        onChange={setSheet}
        onSubmit={(state, amount) => {
          setSheet(null)
          if (state.mode === 'create') submitCreate(state, amount)
          else submitEdit(state, amount)
        }}
        onClosed={focusOpener}
        onDismiss={() => setSheet(null)}
      />
      <LiveAnnouncer announcement={announcement} />
    </Context.Provider>
  )
}
