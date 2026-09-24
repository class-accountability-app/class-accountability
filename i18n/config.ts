export const locales = ['ja', 'en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'ja'

export const LOCALE_COOKIE = 'locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

// Picks the visitor's most-preferred language by q-value (ties keep header
// order). Japanese if that is ja/ja-*, English for any other language, and
// the default when the header is missing, empty or only a wildcard.
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return defaultLocale

  const ranked = header
    .split(',')
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(';')
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const q = qParam ? Number(qParam.slice(2)) : 1
      return { tag: rawTag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index }
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)

  const top = ranked[0]
  if (!top || top.tag === '*') return defaultLocale
  return top.tag === 'ja' || top.tag.startsWith('ja-') ? 'ja' : 'en'
}

export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined
): Locale {
  if (isLocale(cookieValue)) return cookieValue
  return localeFromAcceptLanguage(acceptLanguage)
}
