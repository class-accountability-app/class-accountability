import type { Metadata, Viewport } from 'next'
import { Roboto } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'
import { Nav } from '@/components/nav'
import { TabBar } from '@/components/app-nav'
import { PublicFooter } from '@/components/public-footer'
import { PwaSupport } from '@/components/pwa'
import { PushSync } from '@/components/push'
import { PresencePing } from '@/components/presence'
import './globals.css'

// Material 3 (item H): Roboto for Latin, loaded by next/font. Japanese uses
// the phone's own system font (Hiragino Sans on iPhone, Noto Sans CJK on
// Android, which is Material's own Japanese face), listed in globals.css.
// A downloaded Noto Sans JP meant hundreds of files fetched at build time and
// broke CI twice when one failed; system fonts also load instantly.
const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
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
  themeColor: '#f8fafd',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  // UI-chrome-only reads: whether the nav shows the app links and sign-out,
  // and the classes the クラス tab needs (one class opens it directly). No
  // change to any page's own auth handling.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: memberships } = user
    ? await supabase.from('class_memberships').select('class_id').eq('user_id', user.id)
    : { data: null }
  const classIds = (memberships ?? []).map((m) => m.class_id)

  const fontVariables = [roboto]
    .map((font) => font.variable)
    .join(' ')

  return (
    <html lang={locale} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-body">
        <NextIntlClientProvider>
          <Nav signedIn={!!user} classIds={classIds} />
          <div className="ruled relative flex flex-1 flex-col">
            <div
              aria-hidden
              className="print-hidden pointer-events-none fixed inset-y-0 left-6 hidden w-px bg-accent/60 sm:left-10 sm:block"
            />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
          <PublicFooter signedIn={!!user} />
          {user && <TabBar classIds={classIds} />}
          <PwaSupport />
          {user && <PushSync />}
          {user && <PresencePing />}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
