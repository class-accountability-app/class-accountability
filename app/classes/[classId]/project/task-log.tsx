'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TASK_CHIPS, parseWholeAmount, type TaskMetric } from '@/lib/tasks'
import { FieldError, FormError, describedField } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { isOffline, queueLog } from '@/lib/offline-log'
import { logTaskProgress } from './actions'
import { controlClass } from './create-project-form'

// ＋記録 on one of my counted tasks (mockup view "log", inline instead of a
// sheet for now). Chips add to the field; the client id is made once per
// open form, so a double tap or a retry saves one entry.
export function TaskLog({
  classId,
  taskId,
  userId,
  title,
  metric,
  unit,
}: {
  classId: string
  taskId: string
  userId: string
  title: string
  metric: Exclude<TaskMetric, 'status'>
  unit: string | null
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [clientId, setClientId] = useState(() => crypto.randomUUID())
  const [saved, setSaved] = useState<'saved' | 'queued' | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  const amountError = error === 'logAmountInvalid' ? error : null
  const noteError = error === 'tooLong' ? error : null

  function add(chip: number) {
    setAmount(String((parseWholeAmount(amount) ?? 0) + chip))
    setError(null)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (parseWholeAmount(amount) === null) {
      setError('logAmountInvalid')
      amountRef.current?.focus()
      return
    }
    const done = (how: 'saved' | 'queued') => {
      setAmount('')
      setNote('')
      setClientId(crypto.randomUUID())
      setOpen(false)
      setSaved(how)
    }
    // No connection (feature batch 3): keep it on this phone and send later.
    const queue = async () => {
      const ok = await queueLog({ clientId, userId, classId, taskId, amount, note, queuedAt: Date.now() })
      if (ok) done('queued')
      else setError('offlineNotSaved')
    }
    startTransition(async () => {
      if (isOffline(navigator)) {
        await queue()
        return
      }
      let result
      try {
        result = await logTaskProgress(classId, taskId, { amount, note, clientId })
      } catch {
        await queue()
        return
      }
      if (result.error) {
        setError(result.error)
        return
      }
      done('saved')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3 pb-3.5">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => {
            setOpen(true)
            setSaved(null)
          }}
        >
          {t('log.open')}
        </button>
        {saved && (
          <span role="status" className={`text-[13px] leading-7 ${saved === 'saved' ? 'text-status-active' : 'text-muted'}`}>
            {saved === 'saved' ? t('log.saved') : t('log.queued')}
          </span>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5 pb-3.5" aria-label={t('log.heading', { title })}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className="text-sm font-semibold text-ink">
          {metric === 'characters' ? t('log.amountCharacters') : t('log.amountCount', { unit: unit ?? '' })}
        </label>
        <div className="flex flex-wrap gap-2">
          {TASK_CHIPS[metric].map((chip) => (
            <button key={chip} type="button" onClick={() => add(chip)} className={`${secondaryButtonClass} min-w-14`}>
              +{chip}
            </button>
          ))}
        </div>
        <input
          ref={amountRef}
          id={`${id}-amount`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={controlClass}
          {...describedField(amountError, `${id}-amount-error`)}
        />
        <FieldError id={`${id}-amount-error`} error={amountError} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-semibold text-ink">
          {t('log.noteLabel')}
        </label>
        <input
          id={`${id}-note`}
          type="text"
          maxLength={280}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('log.notePlaceholder')}
          className={controlClass}
          {...describedField(noteError, `${id}-note-error`)}
        />
        <FieldError id={`${id}-note-error`} error={noteError} />
      </div>
      <div className="flex gap-2.5">
        <button type="submit" disabled={isPending} className={`${primaryButtonClass} flex-1`}>
          {isPending ? tCommon('sending') : t('log.submit')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          {tCommon('cancel')}
        </button>
      </div>
      <FormError error={amountError || noteError ? null : error} />
    </form>
  )
}
