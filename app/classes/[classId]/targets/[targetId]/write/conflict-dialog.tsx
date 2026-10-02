'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { ErrorKey } from '@/lib/errors'
import type { Theirs } from '@/lib/autosave'
import { formatDateTime } from '@/lib/date'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { ChoiceDialog } from '@/components/choice-dialog'

// 別の画面で保存された内容があります: the student picks which text to keep;
// the other becomes a version (history), so neither is lost.
export function ConflictDialog({
  theirs,
  mineCount,
  onMine,
  onTheirs,
}: {
  theirs: Theirs | null
  mineCount: string
  onMine: () => void
  onTheirs: () => Promise<{ error: ErrorKey | null }>
}) {
  const t = useTranslations('editor.conflict')
  const tUnits = useTranslations('units')
  const tErrors = useTranslations('errors')
  const locale = useLocale() as Locale
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)

  return (
    <ChoiceDialog open={theirs !== null} labelledBy="conflict-title">
      {theirs && (
        <div className="flex flex-col gap-3">
          <h2 id="conflict-title" className="font-heading text-lg leading-7 font-bold">
            {t('title')}
          </h2>
          <p className="text-[15px] leading-7">{t('body')}</p>
          <ul className="font-meta text-[13px] leading-7 text-muted">
            <li>{t('mineCount', { count: mineCount })}</li>
            <li>
              {t('theirsCount', {
                count: tUnits('character_count', { count: theirs.charCount }),
                time: formatDateTime(theirs.updatedAt, locale),
              })}
            </li>
          </ul>
          {error && (
            <p role="alert" className="text-sm font-semibold text-accent-text">
              {tErrors(error)}
            </p>
          )}
          <div className="flex flex-col gap-2.5 pt-1">
            <button type="button" disabled={working} onClick={onMine} className={primaryButtonClass}>
              {t('mine')}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={async () => {
                setWorking(true)
                setError(null)
                const result = await onTheirs().catch(() => ({ error: 'generic' as const }))
                setWorking(false)
                if (result.error) setError(result.error)
              }}
              className={secondaryButtonClass}
            >
              {working ? t('working') : t('theirs')}
            </button>
          </div>
        </div>
      )}
    </ChoiceDialog>
  )
}

// 保存されていない変更があります: found on opening, typed on the version the
// server still has.
export function DraftDialog({
  editedAt,
  count,
  onRestore,
  onDiscard,
}: {
  editedAt: number | null
  count: string
  onRestore: () => void
  onDiscard: () => void
}) {
  const t = useTranslations('editor.draft')
  const locale = useLocale() as Locale
  return (
    <ChoiceDialog open={editedAt !== null} labelledBy="draft-title">
      {editedAt !== null && (
        <div className="flex flex-col gap-3">
          <h2 id="draft-title" className="font-heading text-lg leading-7 font-bold">
            {t('title')}
          </h2>
          <p className="text-[15px] leading-7">{t('body', { time: formatDateTime(new Date(editedAt), locale), count })}</p>
          <div className="flex flex-col gap-2.5 pt-1">
            <button type="button" onClick={onRestore} className={primaryButtonClass}>
              {t('restore')}
            </button>
            <button type="button" onClick={onDiscard} className={secondaryButtonClass}>
              {t('discard')}
            </button>
          </div>
        </div>
      )}
    </ChoiceDialog>
  )
}
