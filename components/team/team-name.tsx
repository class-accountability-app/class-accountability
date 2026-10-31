'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TEAM_NAME_MAX } from '@/lib/organizer'
import { FieldError, describedField } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { renameTeam } from '@/app/classes/[classId]/organizer-actions'

// The team's name on the board (0036): the organizer may have set it; any
// member can change it here. rename_team() lets members and the organizer only.
export function TeamName({ classId, podId, name }: { classId: string; podId: string; name: string | null }) {
  const t = useTranslations('teamName')
  const tCommon = useTranslations('common')
  const id = useId()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name ?? '')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!editing) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-[13px] leading-7 text-muted">
        <span className="font-semibold text-ink">{name ?? t('unnamed')}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-h-11 items-center text-[13px] text-accent-text underline underline-offset-4"
        >
          {name ? t('rename') : t('giveName')}
        </button>
      </p>
    )
  }

  return (
    <form
      className="flex flex-col gap-1.5 py-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await renameTeam(classId, podId, value)
          if (result.error) {
            setError(result.error)
            return
          }
          setEditing(false)
          router.refresh()
        })
      }}
    >
      <label htmlFor={`${id}-name`} className="text-sm font-semibold text-ink">
        {t('label')}
      </label>
      <input
        id={`${id}-name`}
        value={value}
        maxLength={TEAM_NAME_MAX}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 rounded-lg border border-outline bg-surface px-3 text-base text-ink"
        {...describedField(error, `${id}-error`)}
      />
      <FieldError id={`${id}-error`} error={error} />
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? tCommon('working') : t('save')}
        </button>
        <button type="button" disabled={isPending} onClick={() => setEditing(false)} className={secondaryButtonClass}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
