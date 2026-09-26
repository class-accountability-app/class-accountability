import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isOutsideApp } from '@/lib/nav'

const PUBLIC_ROUTE_PREFIXES = ['/login', '/auth']

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not add logic between createServerClient and getUser() — this
  // call is what actually revalidates the token against Supabase.
  // getSession() would trust the cookie without checking.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    // Remember where they were heading, so login can bring them back (e.g. a
    // class join link). safeNextPath checks it wherever it's read.
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''
    const next = request.nextUrl.pathname + request.nextUrl.search
    if (next !== '/') redirectUrl.searchParams.set('next', next)
    return NextResponse.redirect(redirectUrl)
  }

  if (user && needsNameCheck(request) && request.cookies.get(NAME_OK_COOKIE)?.value !== user.id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name_chosen_at')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && !profile.name_chosen_at) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/welcome'
      redirectUrl.search = ''
      const next = request.nextUrl.pathname + request.nextUrl.search
      if (next !== '/') redirectUrl.searchParams.set('next', next)
      const redirect = NextResponse.redirect(redirectUrl)
      // Keep any refreshed auth cookies from getUser() above.
      supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
      return redirect
    }

    // Chosen: skip this query on later requests. The cookie is only a
    // shortcut, never a permission, so it's fine that a student can edit it.
    // Keyed to the user id, so another account on this browser is checked.
    if (profile) {
      supabaseResponse.cookies.set(NAME_OK_COOKIE, user.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 365,
      })
    }
  }

  // Must return this exact response object so refreshed cookies propagate.
  return supabaseResponse
}

// Set once the student has chosen a display name (see needsNameCheck).
const NAME_OK_COOKIE = 'name_ok'

// Students who haven't chosen a name yet are sent to /welcome first. Only
// page loads: never a server action (POST), never /login, /auth/* or /welcome
// itself (no loops), never a file like /robots.txt.
function needsNameCheck(request: NextRequest): boolean {
  const { pathname } = request.nextUrl
  if (request.method !== 'GET') return false
  if (isOutsideApp(pathname)) return false
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
  return !lastSegment.includes('.')
}
