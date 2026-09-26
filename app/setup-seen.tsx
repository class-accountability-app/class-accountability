'use client'

import { useEffect } from 'react'
import { SETUP_SEEN_COOKIE } from '@/lib/checklist'

// Rendered with the "all done" line. Once it has been on screen, the next
// visit to Home hides the checklist. Set from the browser on purpose: a
// cookie set by a server action makes Next re-render the page at once, which
// would hide the line the moment it appeared.
export function MarkSetupSeen({ userId }: { userId: string }) {
  useEffect(() => {
    const secure = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${SETUP_SEEN_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=31536000; samesite=lax${secure}`
  }, [userId])
  return null
}
