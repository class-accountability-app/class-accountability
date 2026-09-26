// The app's four destinations, shared by the phone tab bar and the desktop
// header links, plus the path rules both of them (and the proxy) rely on.

export type TabId = 'home' | 'classes' | 'nudges' | 'settings'

export const TAB_IDS: readonly TabId[] = ['home', 'classes', 'nudges', 'settings']

// Pages outside the signed-in app: no tab bar, no welcome redirect.
const OUTSIDE_APP = /^\/(login|auth|welcome)(\/|$)/

export function isOutsideApp(pathname: string): boolean {
  return OUTSIDE_APP.test(pathname)
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
