import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

// Not run for build files, images, or the installed-app files (the manifest,
// the service worker and its offline page): the browser fetches those in the
// background, logged out too, and they must never redirect to /login. They
// are also in PUBLIC_EXACT (lib/public-paths.ts), in case this list changes.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
