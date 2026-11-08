import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { sourceFileUrl, type SourceKind } from '@/lib/google-links'
import { secondaryButtonClass } from '@/components/buttons'

// 「ドキュメントを開く」 (2026-11-06): the Google file a task is counted from,
// in a new tab. Shown to the task's owner, and to the whole team for the
// group Doc (shared with the team by design, 0023); Google's own sharing
// decides who can open it, the app adds no access.
// With a label (2026-11-08), the file's kind and name sit above the button,
// so it's clear which Google file the task is counted from.
export async function OpenSourceButton({
  kind,
  fileId,
  label,
  changeHref,
  small = false,
}: {
  kind: SourceKind
  fileId: string
  label?: string | null
  // The task's link page, to swap this file for another (2026-11-08); only
  // passed where the student may change it (their own task).
  changeHref?: string
  small?: boolean
}) {
  const t = await getTranslations('google')
  const button = (
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
  const buttons = changeHref ? (
    <div className="flex flex-wrap items-center gap-2">
      {button}
      <Link href={changeHref} className={`${secondaryButtonClass} ${small ? 'h-11 px-4 text-sm' : ''}`}>
        {t('changeFile')}
      </Link>
    </div>
  ) : (
    button
  )
  if (!label) return buttons
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-6 text-ink">
        <FileIcon kind={kind} />
        <span className="font-meta text-xs text-muted">{t(`kind.${kind}`)}</span>
        <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{t('fileName', { name: label })}</span>
      </p>
      {buttons}
    </div>
  )
}

// A plain outline: a page for Docs, a screen for Slides, a grid for Sheets.
function FileIcon({ kind }: { kind: SourceKind }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {kind === 'slides' ? (
        <>
          <rect x="3" y="5" width="18" height="12" rx="1.5" />
          <path d="M12 17v3M8 20h8" />
        </>
      ) : kind === 'sheet' ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <path d="M4 10h16M4 15h16M10 4v16" />
        </>
      ) : (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4M9 12h6M9 16h6" />
        </>
      )}
    </svg>
  )
}
