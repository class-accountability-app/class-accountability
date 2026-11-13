import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'
import { Nav } from '@/components/nav'
import { SideMenu, TabBar } from '@/components/app-nav'
import { isTeacherOnly } from '@/lib/nav'
import { PublicFooter } from '@/components/public-footer'
import { PwaSupport } from '@/components/pwa'
import { PushSync } from '@/components/push'
import { PresencePing } from '@/components/presence'
import { OfflineLogSync } from '@/components/offline-log-sync'
import './globals.css'

// Soft pastel (2026-11-06): Outfit for Latin, loaded by next/font. Japanese
// uses the phone's own system font (Hiragino Sans on iPhone, Noto Sans CJK on
// Android), listed in globals.css. A downloaded Noto Sans JP meant hundreds of
// files fetched at build time and broke CI twice when one failed; system
// fonts also load instantly.
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

// Everything behind the login is noindex; the landing page (/) and the
// privacy policy override it. The link preview image is app/opengraph-image.png.
// metadataBase is NEXT_PUBLIC_APP_URL in production (www.study-pods.org).
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('metadata'), getLocale()])
  return {
    metadataBase: new URL(await appOrigin()),
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: 'Study Pods',
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
    },
    twitter: { card: 'summary_large_image' },
    // The installed app on iPhone (the manifest is app/manifest.ts; the
    // favicon and apple-icon come from app/favicon.ico and app/apple-icon.png).
    // 'default' keeps the status bar light with dark text and the page below
    // it; 'black-translucent' would put white text over the cream header.
    appleWebApp: { capable: true, title: 'Study Pods', statusBarStyle: 'default' },
  }
}

// viewport-fit=cover lets the page draw under the iPhone home indicator and,
// in landscape, beside the notch, so env(safe-area-inset-*) is non-zero and
// the tab bar and page gutters can pad for it (globals.css). themeColor is the
// header's surface colour: the status bar and title bar match the header.
// Single theme: no dark-mode variant.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f4f7',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [locale, tNav] = await Promise.all([getLocale(), getTranslations('nav')])

  // UI-chrome-only reads: whether the nav shows the app links and sign-out,
  // and the classes the クラス tab needs (one class opens it directly). No
  // change to any page's own auth handling.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: memberships } = user
    ? await supabase.from('class_memberships').select('class_id, role').eq('user_id', user.id)
    : { data: null }
  const classIds = (memberships ?? []).map((m) => m.class_id)
  // A teacher-only account (0015: organizers are never in a team) gets お知らせ
  // where students have 声かけ, which could never show a teacher anything.
  const teacherOnly = isTeacherOnly((memberships ?? []).map((m) => m.role))

  const fontVariables = [outfit]
    .map((font) => font.variable)
    .join(' ')

  return (
    <html lang={locale} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-body">
        {/* Keyboard users skip the header and menu in one step (WCAG 2.4.1). */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-[15px] focus:font-semibold focus:text-page-bg"
        >
          {tNav('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <Nav signedIn={!!user} />
          <div className="flex flex-1">
            {user && <SideMenu classIds={classIds} teacherOnly={teacherOnly} />}
            <div className="ruled relative flex min-w-0 flex-1 flex-col">
              <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</main>
            </div>
          </div>
          <PublicFooter signedIn={!!user} />
          {user && <TabBar classIds={classIds} teacherOnly={teacherOnly} />}
          <PwaSupport />
          {user && <PushSync />}
          {user && <PresencePing />}
          {user && <OfflineLogSync userId={user.id} />}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
