// The app's four destinations, shared by the phone tab bar and the desktop
// header links, plus the path rules both of them (and the proxy) rely on.

export type TabId = 'home' | 'classes' | 'nudges' | 'settings'

export const TAB_IDS: readonly TabId[] = ['home', 'classes', 'nudges', 'settings']

// Pages outside the signed-in app: no tab bar, no welcome redirect.
const OUTSIDE_APP = /^\/(login|auth|welcome)(\/|$)/

export function isOutsideApp(pathname: string): boolean {
  return OUTSIDE_APP.test(pathname)
}

// The class invitation (screen 04) is a single decision with its own buttons,
// so it has no tab bar either. It stays inside the app for the welcome
// redirect: a student who hasn't chosen a name goes through /welcome first.
const JOIN_PAGE = /^\/join(\/|$)/

export function hidesTabBar(pathname: string): boolean {
  return isOutsideApp(pathname) || JOIN_PAGE.test(pathname)
}

// The header ログアウト link on phones: only where there's no tab bar to
// reach 設定 from, once signed in (mockups 03 and 04).
export function showsHeaderSignOutOnPhones(pathname: string): boolean {
  return pathname === '/welcome' || JOIN_PAGE.test(pathname)
}

// The クラス tab opens the class directly when there's exactly one, since
// that's where a student in one class always goes next.
export function classesHref(classIds: readonly string[]): string {
  return classIds.length === 1 ? `/classes/${classIds[0]}` : '/classes'
}

export function tabHref(tab: TabId, classIds: readonly string[]): string {
  switch (tab) {
    case 'home':
      return '/'
    case 'classes':
      return classesHref(classIds)
    case 'nudges':
      return '/nudges'
    case 'settings':
      return '/settings'
  }
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// Which tab a page belongs to, or null (e.g. the 404 page).
export function activeTab(pathname: string): TabId | null {
  if (pathname === '/') return 'home'
  if (isUnder(pathname, '/classes')) return 'classes'
  if (isUnder(pathname, '/nudges')) return 'nudges'
  if (isUnder(pathname, '/settings')) return 'settings'
  return null
}
