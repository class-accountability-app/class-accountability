import type { Metadata, Viewport } from 'next'
import {
  Fraunces,
  Schibsted_Grotesk,
  Courier_Prime,
  Zen_Kaku_Gothic_New,
  Shippori_Mincho,
} from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { TabBar } from '@/components/app-nav'
import './globals.css'

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['500', '600'],
})

const schibstedGrotesk = Schibsted_Grotesk({
  variable: '--font-schibsted-grotesk',
  subsets: ['latin'],
  weight: ['400', '500'],
})

const courierPrime = Courier_Prime({
  variable: '--font-courier-prime',
  subsets: ['latin'],
  weight: ['400', '700'],
})

// Japanese fallbacks after the Latin faces. With preload: false nothing is
// preloaded, so `subsets` has no effect (and next/font rejects 'japanese').
// The generated CSS still covers every unicode-range block; the browser
// downloads only the blocks a page's characters need.
const zenKakuGothicNew = Zen_Kaku_Gothic_New({
  variable: '--font-zen-kaku-gothic-new',
  weight: ['400', '500', '700'],
  preload: false,
})

const shipporiMincho = Shippori_Mincho({
  variable: '--font-shippori-mincho',
  weight: ['500', '700'],
  preload: false,
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata')
  return { title: t('title'), description: t('description') }
}

// viewport-fit=cover lets the page draw under the iPhone home indicator, so
// env(safe-area-inset-bottom) is non-zero and the tab bar can pad for it.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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

  const fontVariables = [fraunces, schibstedGrotesk, courierPrime, zenKakuGothicNew, shipporiMincho]
    .map((font) => font.variable)
    .join(' ')

  return (
    <html lang={locale} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-body">
        <NextIntlClientProvider>
          <Nav signedIn={!!user} classIds={classIds} />
          <div className="relative flex flex-1 flex-col">
            <div
              aria-hidden
              className="pointer-events-none fixed inset-y-0 left-6 hidden w-px bg-accent/60 sm:left-10 sm:block"
            />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
          {user && <TabBar classIds={classIds} />}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
