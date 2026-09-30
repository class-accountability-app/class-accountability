'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { CHIPS, addChip, isHours, parseAmount, percentOf, tidyTotal, type AmountType } from '@/lib/quick-log'
import { FieldError, describedField } from '@/components/form-errors'
import type { QuickTarget } from './quick-log-provider'

export type SheetState =
  | { mode: 'create'; targetId: string; clientId: string; amount: string; description: string }
  | { mode: 'edit'; targetId: string; logId: string; amount: string; description: string }

// Screen 10: a bottom sheet on phones, a centred dialog from sm up. A native
// <dialog> opened with showModal() makes the page behind it inert, keeps
// focus inside and closes on Esc; focus then goes back to the button that
// opened it (onClosed). The drag handle is decoration only.
export function QuickLogSheet({
  state,
  target,
  total,
  editedValue,
  onChange,
  onSubmit,
  onClosed,
  onDismiss,
}: {
  state: SheetState | null
  target: QuickTarget | null
  total: number
  editedValue: number
  onChange: (state: SheetState) => void
  onSubmit: (state: SheetState, amount: number) => void
  onClosed: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('quickLog')
  const tAmounts = useTranslations('amounts')
  const tUnits = useTranslations('units')
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  // Set the moment 記録する is pressed, before React re-renders: a second
  // tap in the same frame sees it and does nothing.
  const submittingRef = useRef(false)
  const [error, setError] = useState<ErrorKey | null>(null)

  // Keep showing the last content while the sheet slides away.
  const [shown, setShown] = useState<{ state: SheetState; target: QuickTarget } | null>(null)
  if (state && target && (shown?.state !== state || shown.target !== target)) {
    setShown({ state, target })
  }

  const sessionKey = state ? (state.mode === 'create' ? state.clientId : state.logId) : null
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (sessionKey && !dialog.open) {
      submittingRef.current = false
      setError(null)
      dialog.showModal()
      const isTask = shown?.target.type === 'task'
      if (isTask) submitRef.current?.focus()
      else amountRef.current?.focus()
    } else if (!sessionKey && dialog.open) {
      dialog.close()
    }
  }, [sessionKey, shown?.target.type])

  const current = shown?.state
  const shownTarget = shown?.target
  const type = shownTarget?.type ?? 'task'
  const isTask = type === 'task'
  const amountType = type as AmountType
  const isEdit = current?.mode === 'edit'

  function amountLine(value: number): string {
    if (isTask || !shownTarget) return ''
    return shownTarget.targetAmount === null
      ? tUnits(amountType, { count: value })
      : tAmounts(amountType, { logged: value, target: shownTarget.targetAmount })
  }

  const parsed = !current || isTask ? null : parseAmount(current.amount, amountType)
  const baseTotal = isEdit ? total - editedValue : total
  const newTotal = parsed === null ? null : tidyTotal(baseTotal + parsed)

  let preview = ''
  if (isTask) {
    preview = isEdit ? t('editTaskNote') : t('previewTask')
  } else if (newTotal !== null && shownTarget) {
    preview =
      shownTarget.targetAmount === null
        ? t(isEdit ? 'editPreviewNoGoal' : 'previewNoGoal', { amount: amountLine(newTotal) })
        : t(isEdit ? 'editPreview' : 'preview', {
            amount: amountLine(newTotal),
            percent: percentOf(newTotal, shownTarget.targetAmount),
          })
  }

  const currentText = isTask
    ? total >= 1
      ? t('currentTaskDone')
      : t('currentTaskOpen')
    : t('current', { amount: amountLine(total) })

  function update(patch: Partial<Pick<SheetState, 'amount' | 'description'>>) {
    if (!current) return
    setError(null)
    onChange({ ...current, ...patch })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!current || submittingRef.current) return
    if (current.description.trim().length > 280) {
      setError('tooLong')
      return
    }
    if (isTask) {
      submittingRef.current = true
      onSubmit(current, 1)
      return
    }
    if (parsed === null) {
      setError(isHours(amountType) ? 'logHoursInvalid' : 'logAmountInvalid')
      amountRef.current?.focus()
      return
    }
    submittingRef.current = true
    onSubmit(current, parsed)
  }

  const ids = {
    title: `${id}-title`,
    amount: `${id}-amount`,
    amountError: `${id}-amount-error`,
    memo: `${id}-memo`,
    memoError: `${id}-memo-error`,
    preview: `${id}-preview`,
  }
  const amountError = error && error !== 'tooLong' ? error : null
  const memoError = error === 'tooLong' ? error : null

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={ids.title}
      onClose={() => {
        onDismiss()
        onClosed()
      }}
      // A tap on the dimmed page (the dialog's own box, outside the panel)
      // closes it, like any bottom sheet.
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close()
      }}
      className="quick-sheet mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[14px] border-t border-border bg-surface p-0 text-ink sm:m-auto sm:max-w-md sm:rounded-[2px] sm:border"
    >
      {current && shownTarget && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-3.5 pt-3 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(28px+env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]"
        >
          <span aria-hidden className="h-1 w-10 self-center rounded-[2px] bg-border sm:hidden" />

          <div className="flex items-center justify-between gap-3">
            <h2 id={ids.title} className="font-heading text-xl font-bold [overflow-wrap:anywhere]">
              {isEdit
                ? t('editTitle', { title: shownTarget.title })
                : t('sheetTitle', { title: shownTarget.title })}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={t('close')}
              className="-mr-3 flex size-11 shrink-0 items-center justify-center"
            >
              <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>

          <p className="-mt-2 font-meta text-xs text-muted">{currentText}</p>

          {!isTask && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.amount} className="text-sm font-semibold">
                  {isEdit ? t(`editAmountLabel.${amountType}`) : t(`amountLabel.${amountType}`)}
                </label>
                <div className="flex items-center gap-2.5">
                  <input
                    ref={amountRef}
                    id={ids.amount}
                    type="text"
                    inputMode={isHours(amountType) ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    enterKeyHint="done"
                    value={current.amount}
                    onChange={(e) => update({ amount: e.target.value })}
                    // Important: the unlayered iOS-zoom rule in globals.css
                    // (max(16px, 1em)) otherwise beats text-[28px].
                    className="h-[60px] w-full min-w-0 flex-1 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 font-meta text-[28px]! text-ink"
                    {...describedField(amountError, ids.amountError, preview ? ids.preview : undefined)}
                  />
                  <span aria-hidden className="text-base">
                    {t(`unit.${amountType}`)}
                  </span>
                </div>
                <FieldError id={ids.amountError} error={amountError} />
              </div>

              <div role="group" aria-label={t('chipsLabel')} className="flex gap-2">
                {CHIPS[amountType].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => update({ amount: addChip(current.amount, chip, amountType) })}
                    className="h-11 flex-1 rounded-[22px] border border-border bg-[#fffdf7] text-[15px] text-ink"
                  >
                    {t('chip', { amount: chip })}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.memo} className="text-sm font-semibold">
              {t('memoLabel')}
            </label>
            <textarea
              id={ids.memo}
              rows={2}
              maxLength={280}
              value={current.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={t('memoPlaceholder')}
              className="w-full resize-none rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 py-2.5 leading-[1.6] text-ink placeholder:text-muted"
              {...describedField(memoError, ids.memoError)}
            />
            <FieldError id={ids.memoError} error={memoError} />
          </div>

          <button
            ref={submitRef}
            type="submit"
            aria-describedby={preview ? ids.preview : undefined}
            className="btn flex h-[52px] w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white"
          >
            {isEdit ? t('save') : isTask ? t('complete') : t('submit')}
          </button>
          <p id={ids.preview} className="-mt-1 min-h-[1lh] text-center text-xs text-muted">
            {preview}
          </p>
        </form>
      )}
    </dialog>
  )
}
