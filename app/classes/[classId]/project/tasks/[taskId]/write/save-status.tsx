'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { AutosaveState } from '@/lib/autosave'
import { formatClock } from '@/lib/date'

// 保存しました（14:05）, 保存中…, or 保存できていません（再試行します）
// with 今すぐ保存. Only a failure is announced to screen readers (role
// "alert" text appearing); the saved/saving line changes every few seconds
// while typing and would be noise.
export function SaveStatus({ state, onSaveNow }: { state: AutosaveState; onSaveNow: () => void }) {
  const t = useTranslations('editor.status')
  const tErrors = useTranslations('errors')
  const locale = useLocale() as Locale

  if (state.blocked) {
    return (
      <p role="alert" className="text-sm leading-7 font-semibold text-accent-text">
        {tErrors(state.blocked)}
      </p>
    )
  }

  switch (state.status) {
    case 'saved':
      return (
        <p className="font-meta text-[13px] leading-7 text-muted">
          {state.savedAt ? t('saved', { time: formatClock(state.savedAt, locale) }) : t('auto')}
        </p>
      )
    case 'dirty':
    case 'saving':
    case 'savingDirty':
      return <p className="font-meta text-[13px] leading-7 text-muted">{t('saving')}</p>
    case 'retrying':
      return (
        <div className="flex flex-wrap items-center gap-x-3">
          <p role="alert" className="text-sm leading-7 font-semibold text-accent-text">
            {t('retrying')}
            <span className="block text-[13px] font-normal text-muted">{t('retryingNote')}</span>
          </p>
          <button
            type="button"
            onClick={onSaveNow}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            {t('saveNow')}
          </button>
        </div>
      )
    case 'conflict':
      return <p className="text-sm leading-7 font-semibold text-accent-text">{t('conflict')}</p>
  }
}
