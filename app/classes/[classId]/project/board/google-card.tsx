import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { docUrl } from '@/lib/google-links'
import { secondaryButtonClass } from '@/components/buttons'

// 自動で記録: shows on every started project. A team that still has a group
// Doc (made before 2026-11-08) gets its open button; a student who connected
// Google is told each owner makes their own file; anyone else is asked to
// connect. With nothing to count yet it points to adding a counted task.
export async function GoogleCard({
  boardPath,
  groupDocId,
  hasGoogle,
  hasCountedTask,
}: {
  boardPath: string
  groupDocId: string | null
  hasGoogle: boolean
  hasCountedTask: boolean
}) {
  const t = await getTranslations('google')
  const addCountedTask = (
    <Link href={`${boardPath}/tasks/new`} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4">
      ＋ {t('addCountedTask')}
    </Link>
  )
  const heading = (text: string) => (
    <h2 id="google-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
      {text}
    </h2>
  )
  return (
    <section aria-labelledby="google-heading" className="rule-card flex flex-col px-5 py-5">
      <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('kicker')}</p>
      {groupDocId ? (
        <>
          {heading(t('groupDocTitle'))}
          <p className="text-[13px] leading-7 text-muted">{t('groupDocWhy')}</p>
          <div className="pt-3.5">
            <a href={docUrl(groupDocId)} target="_blank" rel="noopener noreferrer" className={`${secondaryButtonClass} w-full`}>
              {t('groupDocOpen')}
            </a>
          </div>
        </>
      ) : hasGoogle ? (
        <>
          {heading(t('connectedTitle'))}
          <p className="text-[13px] leading-7 text-muted">{hasCountedTask ? t('perTaskWhy') : t('noCountedTask')}</p>
          {!hasCountedTask && addCountedTask}
        </>
      ) : (
        <>
          {heading(t('connectTitle'))}
          <p className="text-[13px] leading-7 text-muted">{t('connectWhy')}</p>
          <div className="pt-3.5">
            <a href={`/api/google/connect?return=${encodeURIComponent(boardPath)}`} className={`${secondaryButtonClass} w-full`}>
              {t('connect')}
            </a>
          </div>
          <p className="text-[13px] leading-7 text-muted">{t('connectFine')}</p>
          {!hasCountedTask && (
            <>
              <p className="text-[13px] leading-7 text-muted">{t('noCountedTask')}</p>
              {addCountedTask}
            </>
          )}
        </>
      )}
    </section>
  )
}
