// Which paths a logged-out visitor may open without being sent to /login.
// Everything else (every page inside the app, /join/{code}, /welcome) still
// redirects to /login?next=…, exactly as before.

// Whole sections: the login flow.
const PUBLIC_PREFIXES = ['/login', '/auth']

// Single pages: the landing page (logged in, / is Home: the page decides),
// the privacy policy, what crawlers ask for, and the installed-app files
// (the proxy's matcher already skips those; this is the backstop).
const PUBLIC_EXACT = new Set([
  '/',
  '/privacy',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
])

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

// Pages anyone can read before choosing a display name, so /welcome doesn't
// get in the way (the privacy policy is linked from the login page).
export function skipsNameCheck(pathname: string): boolean {
  return pathname === '/privacy'
}
