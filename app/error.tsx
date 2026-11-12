'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'

// Any page that fails to render (a dropped connection mid-load, a server
// error): say so in plain words and offer to try again, instead of Next's
// blank error screen. The header and tab bar stay, since this sits inside
// the root layout. Nothing about the error itself is shown.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errorPage')
  return (
    <div className="flex flex-1 flex-col px-4 pt-7 pb-8 sm:px-6">
      <div role="alert" className="rule-card tint-hudson mx-auto flex w-full max-w-md flex-col gap-3.5 px-5 py-5">
        <h1 className="font-heading text-[28px] leading-tight font-bold text-ink">{t('title')}</h1>
        <p className="text-[15px] leading-7 text-ink">{t('body')}</p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button type="button" onClick={reset} className={primaryButtonClass}>
            {t('retry')}
          </button>
          <Link href="/" className={secondaryButtonClass}>
            {t('home')}
          </Link>
        </div>
      </div>
    </div>
  )
}
