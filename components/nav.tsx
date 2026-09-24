import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { setLocale } from '@/i18n/actions'

// Persistent shell nav: wordmark left, language switch and sign-out right.
// Lives once in the root layout — no page reimplements it.
export async function Nav({ signedIn }: { signedIn: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('nav'), getLocale()])
  const target = locale === 'ja' ? 'en' : 'ja'

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2 sm:px-10">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight text-ink sm:text-xl"
        >
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
          {signedIn && (
            <form action="/auth/signout" method="post">
              <button type="submit" className="nav-link min-h-11 px-2 font-meta text-xs text-muted">
                {t('signOut')}
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  )
}
