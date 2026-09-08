import type { Metadata } from 'next'
import { Fraunces, Schibsted_Grotesk, Courier_Prime } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
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

export const metadata: Metadata = {
  title: 'Study Pods',
  description: 'Quiet, class-scoped accountability pods.',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // UI-chrome-only read: decides whether the nav shows "sign out". No
  // business data touched, no change to any page's own auth handling.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${schibstedGrotesk.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">
        <Nav signedIn={!!user} />
        <div className="relative flex flex-1 flex-col">
          <div
            aria-hidden
            className="pointer-events-none fixed inset-y-0 left-6 hidden w-px bg-accent/60 sm:left-10 sm:block"
          />
          <main className="flex flex-1 flex-col">{children}</main>
        </div>
      </body>
    </html>
  )
}
