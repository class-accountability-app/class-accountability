'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  TAB_IDS,
  activeTab,
  hidesTabBar,
  isOutsideApp,
  showsHeaderSignOutOnPhones,
  tabHref,
  tabTransitionTypes,
  type TabId,
} from '@/lib/nav'
import { SignOutForm } from '@/components/sign-out-form'

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

// Phones (under 768px): a floating Umbra bar above the home indicator, the
// current tab on a porcelain pill. The spacer sits in the page flow with the
// bar's height, so the last thing on a page can always scroll clear of it.
export function TabBar({ classIds, teacherOnly = false }: { classIds: string[]; teacherOnly?: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  if (hidesTabBar(pathname)) return null
  const current = activeTab(pathname)

  return (
    <>
      <div aria-hidden className="h-[calc(96px+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <nav
        aria-label={t('main')}
        className="tab-bar fixed right-[calc(12px+env(safe-area-inset-right))] bottom-[calc(12px+env(safe-area-inset-bottom))] left-[calc(12px+env(safe-area-inset-left))] z-20 rounded-[28px] bg-ink md:hidden"
      >
        <ul className="grid h-[68px] grid-cols-4 px-1.5">
          {TAB_IDS.map((tab) => {
            const isCurrent = tab === current
            return (
              <li key={tab} className="flex">
                <Link
                  href={tabHref(tab, classIds)}
                  transitionTypes={tabTransitionTypes(current, tab)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-[3px] rounded-[22px] text-[11px] text-page-bg focus-visible:outline-page-bg ${
                    isCurrent ? 'font-bold' : 'font-medium'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                      isCurrent ? 'bg-page-bg text-ink' : ''
                    }`}
                  >
                    <TabIcon tab={tab} />
                  </span>
                  {t(tab === 'nudges' && teacherOnly ? 'tabs.announcements' : `tabs.${tab}`)}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

// 768px and up: the same four destinations as a dark side menu on the left
// (screen A of the 2026-11-06 design). A spacer keeps the page clear of it.
export function SideMenu({ classIds, teacherOnly = false }: { classIds: string[]; teacherOnly?: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  if (isOutsideApp(pathname)) return null
  const current = activeTab(pathname)

  return (
    <div className="hidden w-[120px] shrink-0 md:block">
      <nav
        aria-label={t('main')}
        className="tab-bar sticky top-4 mt-4 ml-4 w-24 rounded-[28px] bg-ink py-4"
      >
        <ul className="flex flex-col items-center gap-2">
          {TAB_IDS.map((tab) => {
            const isCurrent = tab === current
            return (
              <li key={tab}>
                <Link
                  href={tabHref(tab, classIds)}
                  transitionTypes={tabTransitionTypes(current, tab)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex min-h-16 w-20 flex-col items-center justify-center gap-1 rounded-[20px] text-xs text-page-bg focus-visible:outline-page-bg ${
                    isCurrent ? 'font-bold' : 'font-medium'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-9 w-14 items-center justify-center rounded-full transition-colors ${
                      isCurrent ? 'bg-page-bg text-ink' : ''
                    }`}
                  >
                    <TabIcon tab={tab} />
                  </span>
                  {t(tab === 'nudges' && teacherOnly ? 'tabs.announcements' : `tabs.${tab}`)}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

// Logged-out visitors on the landing page and the privacy policy get the
// design's ログイン button in the header. Not on /login itself.
const SHOWS_HEADER_LOG_IN = new Set(['/', '/privacy'])

export function HeaderLogIn() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  if (!SHOWS_HEADER_LOG_IN.has(pathname)) return null

  return (
    <Link
      href="/login"
      className="btn ml-1 inline-flex h-11 items-center rounded-full bg-accent px-4 text-[15px] font-semibold text-white sm:px-[22px]"
    >
      {t('logIn')}
    </Link>
  )
}

// On phones, log out lives in 設定 (mockups 12, 13); the welcome screen and
// the class invitation have no tab bar, so they keep the header link
// (mockups 03, 04). Desktop always has it.
export function HeaderSignOut() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const onPhonesToo = showsHeaderSignOutOnPhones(pathname)

  return (
    <SignOutForm
      className={onPhonesToo ? undefined : 'hidden md:block'}
      buttonClassName="nav-link min-h-11 px-2 font-meta text-xs text-muted"
    >
      {t('signOut')}
    </SignOutForm>
  )
}
