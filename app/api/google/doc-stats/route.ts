import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/google/tokens'
import { countDoc } from '@/lib/google/counts'

// Reads a Doc's plain-text export just long enough to count it. The text
// itself is never logged, stored, or returned — only the derived counts and
// metadata leave this function.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const fileId = body?.fileId
  const forceRefresh = body?.forceRefresh === true
  if (!fileId || typeof fileId !== 'string') {
    return NextResponse.json({ error: 'fileId required' }, { status: 400 })
  }

  try {
    const accessToken = await getValidAccessToken(forceRefresh)
    const headers = { Authorization: `Bearer ${accessToken}` }

    // cache: 'no-store' is required here — Next.js's fetch patch otherwise
    // caches this GET in its Data Cache, which silently served a stale
    // modifiedTime after a real edit during verification.
    const [textRes, metaRes] = await Promise.all([
      fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
        { headers, cache: 'no-store' }
      ),
      fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=modifiedTime,name`,
        { headers, cache: 'no-store' }
      ),
    ])

    if (!textRes.ok) throw new Error(`Doc export failed: ${textRes.status}`)
    if (!metaRes.ok) throw new Error(`Metadata fetch failed: ${metaRes.status}`)

    const text = await textRes.text()
    const meta = await metaRes.json()
    const counts = countDoc(text)
    // `text` falls out of scope here — nothing below this line touches it.

    return NextResponse.json({
      charsWithSpaces: counts.charsWithSpaces,
      charsNoSpaces: counts.charsNoSpaces,
      modifiedTime: meta.modifiedTime as string,
      name: meta.name as string,
      forceRefreshed: forceRefresh,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
