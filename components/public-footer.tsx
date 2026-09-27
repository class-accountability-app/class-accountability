'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CONTACT_EMAIL, PRIVACY_POLICY_PATH } from '@/lib/contact'

// The footer of the public pages: the landing page (logged out) and the
// privacy policy. Rendered by the root layout after <main>, so it is the
// page's contentinfo landmark.
export function PublicFooter({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('publicFooter')
  const pathname = usePathname()
  const shown = pathname === PRIVACY_POLICY_PATH || (pathname === '/' && !signedIn)
  if (!shown) return null

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:py-10">
        <div>
          <div className="font-heading text-xl font-semibold">Study Pods</div>
          <p className="mt-2 text-sm text-muted">{t('tagline')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-col text-sm sm:flex-row sm:gap-6">
            <Link
              href={PRIVACY_POLICY_PATH}
              className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-4"
            >
              {t('privacy')}
            </Link>
            <span className="inline-flex min-h-11 flex-wrap items-center text-[#4a3d2c]">
              {t('contact')}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent-text underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
            </span>
          </div>
          <span className="font-meta text-xs text-muted">{t('copyright')}</span>
        </div>
      </div>
    </footer>
  )
}
