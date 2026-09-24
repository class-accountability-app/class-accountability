'use server'

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from './config'

// Setting a cookie in a Server Action makes Next re-render the current route,
// so the page comes back in the new language without a manual refresh.
export async function setLocale(formData: FormData) {
  const locale = formData.get('locale')
  if (!isLocale(locale)) return

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })
}
