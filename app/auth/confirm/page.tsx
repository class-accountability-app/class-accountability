import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ConfirmButton } from './confirm-button'

// The email button lands here: /auth/confirm?token_hash=…&type=email&next=…
// Opening the page (a GET) verifies nothing. Outlook's Safe Links scanner
// opens links before the student does; if a GET logged in, the scanner would
// use up the one-time token (and with it the 6-digit code, which shares it).
// Only pressing ログインする spends the token.
export const metadata: Metadata = {
  // The URL carries the token hash; don't hand it to any page linked from here.
  referrer: 'no-referrer',
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmButton />
    </Suspense>
  )
}
