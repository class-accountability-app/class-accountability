import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { EmptyState, emptyActionClass } from '@/components/empty-state'

// Any unknown URL, in the page's language (locale comes from the cookie /
// Accept-Language, as everywhere else). Also what /privacy shows until
// prompt 6 builds it.
export default async function NotFound() {
  const t = await getTranslations('notFound')

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <p className="font-meta text-[13px] text-muted">{t('eyebrow')}</p>
        <EmptyState
          illustration="notFound"
          title={t('title')}
          headingLevel="h1"
          body={t('body')}
          action={
            <Link href="/" className={emptyActionClass}>
              {t('home')}
            </Link>
          }
        />
      </div>
    </div>
  )
}
