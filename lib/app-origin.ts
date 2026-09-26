import { headers } from 'next/headers'
import { parseOrigin } from './join-link'

// This site's origin for links people share (the class join link).
// NEXT_PUBLIC_APP_URL wins; it's set only in Vercel Production, so preview
// deploys and local dev use the origin the request arrived on.
export async function appOrigin(): Promise<string> {
  const configured = parseOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (configured) return configured

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return parseOrigin(`${proto}://${host}`) ?? 'http://localhost:3000'
}
