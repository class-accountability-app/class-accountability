import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { setLocale } from '@/i18n/actions'
import { HeaderLogIn, HeaderSignOut } from '@/components/app-nav'
import { SpMark } from '@/components/brand-mark'

// Persistent shell nav: the sp mark and name left, then the language switch
// and sign-out. The page links are the side menu on desktop and the tab bar
// on phones (components/app-nav.tsx).
// Lives once in the root layout — no page reimplements it.
export async function Nav({ signedIn }: { signedIn: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('nav'), getLocale()])
  const target = locale === 'ja' ? 'en' : 'ja'

  return (
    <header className="site-header border-b border-border bg-surface">
      {/* Logged out, the header spans the landing page's width (screens Main/Mobile). */}
      <div
        className={`mx-auto flex items-center justify-between gap-4 px-4 py-2 ${
          signedIn ? 'max-w-none sm:px-6' : 'max-w-[1200px] sm:px-10 lg:h-[76px]'
        }`}
      >
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5 font-heading text-lg font-semibold tracking-tight text-ink sm:text-xl"
        >
          <SpMark size={36} />
          {t('brand')}
        </Link>
        <div className="flex items-center gap-2">
          {/* A form, not a JS click handler: works before hydration too. */}
          <form action={setLocale}>
            <input type="hidden" name="locale" value={target} />
            <button
              type="submit"
              lang={target}
              aria-label={target === 'en' ? t('switchToEnglishLabel') : t('switchToJapaneseLabel')}
              className="min-h-11 px-2 font-meta text-sm text-muted underline underline-offset-4"
            >
              {target === 'en' ? t('switchToEnglish') : t('switchToJapanese')}
            </button>
          </form>
          {signedIn ? <HeaderSignOut /> : <HeaderLogIn />}
        </div>
      </div>
    </header>
  )
}
