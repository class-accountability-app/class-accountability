// The class join link: https://www.study-pods.org/join/{code}. The origin is
// never hard-coded; lib/app-origin.ts reads it from NEXT_PUBLIC_APP_URL (set
// in Vercel Production) or, without it, from the request (previews, local dev).

// Only the scheme and host of a configured URL count; anything else (a
// missing scheme, a path, a typo) is ignored so the request origin is used.
export function parseOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

// The full link: what the QR code encodes and what コピー copies.
export function joinUrl(origin: string, code: string): string {
  return `${origin}/join/${encodeURIComponent(code)}`
}

// For reading off a screen: no scheme, and no "www." (study-pods.org
// redirects to www with the path kept, checked on 2026-09-26). Never encoded
// in the QR code.
export function shortJoinUrl(fullUrl: string): string {
  const url = new URL(fullUrl)
  const host = url.host.replace(/^www\./, '')
  return `${host}${url.pathname}`
}

// "K7M3Q9TX" → "K7M3 Q9TX", for reading aloud. The lookup ignores the space.
export function groupedCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}
