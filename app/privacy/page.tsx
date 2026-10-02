import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { CONTACT_EMAIL } from '@/lib/contact'

// The privacy policy (docs/mockups/phase1/17-privacy.dc.html), public and in
// both languages. The wording is the author's; change it only on purpose.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata')
  return {
    title: t('privacyTitle'),
    robots: { index: true, follow: true },
    alternates: { canonical: '/privacy' },
  }
}

const GOOGLE_USER_DATA_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy'

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-12 mb-3 font-heading text-[22px] leading-[1.45] font-bold text-ink first-of-type:mt-14 lg:text-2xl">
      {children}
    </h2>
  )
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li>
      <strong className="font-semibold text-ink">{label}</strong>
      {children}
    </li>
  )
}

const list = 'list-disc pl-[1.3em]'
const mail = 'text-accent-text underline underline-offset-4'

export default async function PrivacyPage() {
  const [t, locale] = await Promise.all([getTranslations('privacy'), getLocale()])
  // Japanese body text needs more leading than English (as in the design).
  const bodyText = locale === 'ja' ? 'text-base leading-[1.95]' : 'text-[17px] leading-[1.75]'
  const space = locale === 'ja' ? '' : ' '

  return (
    <article className={`mx-auto w-full max-w-[760px] px-5 pt-12 pb-16 text-[#4a3d2c] lg:px-0 lg:pt-[88px] lg:pb-28 ${bodyText}`}>
      <p className="font-meta text-sm text-muted">{t('effective')}</p>
      <p className="mb-3 font-meta text-sm text-muted">{t('updated')}</p>
      <h1 className="font-heading text-[34px] leading-[1.35] font-bold text-ink lg:text-[42px]">{t('title')}</h1>
      <p className="mt-6">{t('intro')}</p>

      <H2>{t('collectHeading')}</H2>
      <ul className={list}>
        <Labelled label={t('accountLabel')}>{space + t('accountText')}</Labelled>
        <Labelled label={t('membershipLabel')}>{space + t('membershipText')}</Labelled>
        <Labelled label={t('contentLabel')}>{space + t('contentText')}</Labelled>
        <Labelled label={t('googleLabel')}>{space + t('googleText')}</Labelled>
        <Labelled label={t('notifyLabel')}>{space + t('notifyText')}</Labelled>
        <Labelled label={t('cookieLabel')}>{space + t('cookieText')}</Labelled>
      </ul>
      <p className="mt-3">{t('noText')}</p>

      <H2>{t('useHeading')}</H2>
      <p>{t('useText')}</p>

      <H2>{t('googleHeading')}</H2>
      <p className="mb-3">{t('googleIntro')}</p>
      <ul className={list}>
        <li>{t('google1')}</li>
        <li>{t('google2')}</li>
        <li>{t('google3')}</li>
        <li>{t('google4')}</li>
      </ul>
      <p className="mt-4 rounded-[2px] border border-border bg-surface px-5 py-4">
        {t.rich('limitedUse', {
          link: (chunks) => (
            <a href={GOOGLE_USER_DATA_POLICY} className={mail}>
              {chunks}
            </a>
          ),
        })}
      </p>

      <H2>{t('whoHeading')}</H2>
      <ul className={list}>
        <Labelled label={t('podLabel')}>{space + t('podText')}</Labelled>
        <Labelled label={t('classLabel')}>{space + t('classText')}</Labelled>
        <Labelled label={t('organizerLabel')}>{space + t('organizerText')}</Labelled>
        <Labelled label={t('devLabel')}>{space + t('devText')}</Labelled>
      </ul>

      <H2>{t('servicesHeading')}</H2>
      <ul className={list}>
        <li>{t('serviceSupabase')}</li>
        <li>{t('serviceVercel')}</li>
        <li>{t('serviceResend')}</li>
        <li>{t('serviceGoogle')}</li>
        <li>{t('servicePush')}</li>
      </ul>
      <p className="mt-3">{t('servicesNote')}</p>

      <H2>{t('researchHeading')}</H2>
      <p>{t('researchText')}</p>

      <H2>{t('retentionHeading')}</H2>
      <p>{t('retentionText')}</p>

      <H2>{t('contactHeading')}</H2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`} className={mail}>
          {CONTACT_EMAIL}
        </a>
      </p>

      <H2>{t('changesHeading')}</H2>
      <p>{t('changesText')}</p>

      <H2>{t('priceHeading')}</H2>
      <p>{t('priceText')}</p>

      <p className="mt-14">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline underline-offset-4">
          {t('back')}
        </Link>
      </p>
    </article>
  )
}
