// Where to send someone after they log in. `next` arrives in a URL the
// student can be tricked into opening, so it is an open-redirect risk: only a
// path on this site is accepted, anything else falls back to Home.

const HOME = '/'

// Pages that only make sense before login (or, for /welcome, on the way in);
// sending someone back to them afterwards would loop.
const AUTH_PATH = /^\/(login|auth|welcome)(\/|\?|#|$)/

// Control characters: browsers drop tabs and newlines inside URLs, so
// "/\t/evil.example" would turn into "//evil.example".
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

function looksSafe(path: string): boolean {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('\\') &&
    !CONTROL_CHARS.test(path)
  )
}

// A relative path that starts with exactly one "/", or Home.
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !looksSafe(raw)) return HOME

  // Check the decoded form too, so "/%2F/evil.example" or "/%5Cevil.example"
  // can't turn into "//" or "\" further down the line.
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return HOME
  }
  if (!looksSafe(decoded)) return HOME

  // Last check: resolved against a dummy origin, it must stay on that origin.
  const base = 'https://study-pods.invalid'
  if (new URL(raw, base).origin !== base) return HOME

  if (AUTH_PATH.test(raw)) return HOME
  return raw
}

// The email button carries `next={{ .RedirectTo }}`, which is the full
// emailRedirectTo URL: "<origin>/auth/callback?next=<path>". Take the path the
// student was heading for out of it. Only a path is kept, never the origin.
export function nextFromRedirectTo(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return HOME
  if (raw.startsWith('/')) return safeNextPath(raw)

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return HOME
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return HOME
  if (url.pathname === '/auth/callback') return safeNextPath(url.searchParams.get('next'))
  return safeNextPath(url.pathname + url.search)
}
