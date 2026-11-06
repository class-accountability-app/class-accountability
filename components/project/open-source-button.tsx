import { getTranslations } from 'next-intl/server'
import { sourceFileUrl, type SourceKind } from '@/lib/google-links'
import { secondaryButtonClass } from '@/components/buttons'

// 「ドキュメントを開く」 (2026-11-06): the Google file a task is counted from,
// in a new tab. Shown to the task's owner, and to the whole team for the
// group Doc (shared with the team by design, 0023); Google's own sharing
// decides who can open it, the app adds no access.
export async function OpenSourceButton({ kind, fileId, small = false }: { kind: SourceKind; fileId: string; small?: boolean }) {
  const t = await getTranslations('google')
  return (
    <a
      href={sourceFileUrl(kind, fileId)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${secondaryButtonClass} ${small ? 'h-11 px-4 text-sm' : ''} self-start`}
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
      {t(`open.${kind}`)}
      <span className="sr-only">{t('opensNewTab')}</span>
    </a>
  )
}
