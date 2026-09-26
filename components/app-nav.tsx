'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TAB_IDS, activeTab, isOutsideApp, tabHref, type TabId } from '@/lib/nav'

// Line icons from the mockups' tab bar (docs/mockups/phase1, 12 and 13).
function TabIcon({ tab }: { tab: TabId }) {
  return (
    <svg
      aria-hidden
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tab === 'home' && (
        <>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5.5 9v11h13V9" />
          <path d="M10 20v-6h4v6" />
        </>
      )}
      {tab === 'classes' && (
        <>
          <path d="M4 4.5h7a2 2 0 0 1 2 2V20a1.5 1.5 0 0 0-1.5-1.5H4z" />
          <path d="M20 4.5h-7a2 2 0 0 0-2 2V20a1.5 1.5 0 0 1 1.5-1.5H20z" />
        </>
      )}
      {tab === 'nudges' && (
        <>
          <path d="M4 5h16v11H9l-4 3.5V16H4z" />
          <path d="M8 9.5h8M8 12.5h5" />
        </>
      )}
      {tab === 'settings' && (
        <>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </>
      )}
    </svg>
  )
}

// Phones (under 768px): fixed to the bottom, above the home indicator. The
// spacer sits in the page flow with the bar's height, so the last thing on a
// page can always scroll clear of it.
export function TabBar({ classIds }: { classIds: string[] }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  if (isOutsideApp(pathname)) return null
  const current = activeTab(pathname)

  return (
    <>
      <div aria-hidden className="h-[calc(68px+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <nav
        aria-label={t('main')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid h-[68px] grid-cols-4">
          {TAB_IDS.map((tab) => {
            const isCurrent = tab === current
            return (
              <li key={tab} className="flex">
                <Link
                  href={tabHref(tab, classIds)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-[3px] text-[11px] ${
                    isCurrent ? 'font-bold text-accent-text' : 'font-medium text-muted'
                  }`}
                >
                  {isCurrent && (
                    <span aria-hidden className="absolute -top-px right-[28%] left-[28%] h-[3px] bg-accent-text" />
                  )}
                  <TabIcon tab={tab} />
                  {t(`tabs.${tab}`)}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

// 768px and up: the same four destinations as text links in the header.
export function DesktopLinks({ classIds }: { classIds: string[] }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  if (isOutsideApp(pathname)) return null
  const current = activeTab(pathname)

  return (
    <nav aria-label={t('main')} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {TAB_IDS.map((tab) => (
          <li key={tab}>
            <Link
              href={tabHref(tab, classIds)}
              aria-current={tab === current ? 'page' : undefined}
              className={`nav-link inline-flex min-h-11 items-center px-2 text-sm ${
                tab === current ? 'font-semibold text-accent-text' : 'text-muted'
              }`}
            >
              {t(`tabs.${tab}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// On phones, log out lives in 設定 (mockups 12, 13); the welcome screen has no
// tab bar, so it keeps the header link (mockup 03). Desktop always has it.
export function HeaderSignOut() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const onWelcome = pathname === '/welcome'

  return (
    <form action="/auth/signout" method="post" className={onWelcome ? undefined : 'hidden md:block'}>
      <button type="submit" className="nav-link min-h-11 px-2 font-meta text-xs text-muted">
        {t('signOut')}
      </button>
    </form>
  )
}
