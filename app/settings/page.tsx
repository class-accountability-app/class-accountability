import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { setLocale } from '@/i18n/actions'
import { locales } from '@/i18n/config'
import { PRIVACY_POLICY_PATH, dataDeletionHref } from '@/lib/contact'
import { DisplayNameForm } from './display-name-form'

const LANGUAGE_NAMES = { ja: '日本語', en: 'English' } as const

const sectionClass = 'flex flex-col rounded-[2px] border border-border bg-surface'
const rowClass =
  'flex min-h-[52px] w-full items-center justify-between text-[15px] font-semibold'

function Chevron() {
  return (
    <svg
      aria-hidden
      width="8"
      height="14"
      viewBox="0 0 10 16"
      fill="none"
      stroke="var(--muted)"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M2 2l6 6-6 6" />
    </svg>
  )
}

// Screen 13, without the notification switches (phase 2).
export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, t, locale] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    getTranslations('settings'),
    getLocale(),
  ])

  const emailNoteId = 'settings-email-note'

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{t('title')}</h1>

        <section aria-labelledby="settings-profile" className={`${sectionClass} gap-2.5 p-[18px]`}>
          <h2 id="settings-profile" className="font-heading text-xl font-bold text-ink">
            {t('profileHeading')}
          </h2>
          <DisplayNameForm currentName={profile?.display_name ?? ''} emailNoteId={emailNoteId} />
          {/* The student's own address, from their session. It is not in
              profiles, so no classmate can ever read it. */}
          <p id={emailNoteId} className="text-[13px] text-muted [overflow-wrap:anywhere]">
            {t('email', { email: user.email ?? '' })}
          </p>
        </section>

        <section aria-labelledby="settings-language" className={`${sectionClass} gap-2.5 p-[18px]`}>
          <h2 id="settings-language" className="font-heading text-xl font-bold text-ink">
            {t('languageHeading')}
          </h2>
          {/* Two submit buttons on the existing locale action: works before
              hydration, and aria-pressed says which language is on. */}
          <form
            action={setLocale}
            role="group"
            aria-labelledby="settings-language"
            className="flex overflow-hidden rounded-[2px] border border-[#b9a57c]"
          >
            {locales.map((option, index) => {
              const isCurrent = option === locale
              return (
                <button
                  key={option}
                  type="submit"
                  name="locale"
                  value={option}
                  lang={option}
                  aria-pressed={isCurrent}
                  className={`min-h-11 flex-1 px-2 py-1.5 text-sm ${index > 0 ? 'border-l border-[#b9a57c]' : ''} ${
                    isCurrent ? 'bg-ink text-surface' : 'bg-[#fffdf7] text-ink'
                  }`}
                >
                  {LANGUAGE_NAMES[option]}
                </button>
              )
            })}
          </form>
        </section>

        <section className={`${sectionClass} px-[18px] py-1.5`}>
          <Link href={PRIVACY_POLICY_PATH} className={`${rowClass} border-b border-dashed border-[#e3d4b0] text-ink`}>
            {t('privacyPolicy')}
            <Chevron />
          </Link>
          {/* TODO: CONTACT_EMAIL in lib/contact.ts, address to come. */}
          <a
            href={dataDeletionHref(t('deleteDataSubject'))}
            className={`${rowClass} border-b border-dashed border-[#e3d4b0] text-ink`}
          >
            {t('deleteData')}
            <Chevron />
          </a>
          <form action="/auth/signout" method="post">
            <button type="submit" className={`${rowClass} text-left text-accent-text`}>
              {t('signOut')}
              <Chevron />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
