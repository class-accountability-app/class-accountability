'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadLoginAttempt, type LoginAttempt } from '@/lib/auth/login-code'
import { safeNextPath } from '@/lib/auth/next-path'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'

function LoginFlow() {
  const searchParams = useSearchParams()
  const authFailed = searchParams.get('error') === 'auth_failed'
  const next = safeNextPath(searchParams.get('next'))

  // Set once the code is sent. Restored from sessionStorage, so a phone
  // reloading this tab after a trip to the mail app lands back on the code
  // screen instead of starting over.
  const [attempt, setAttempt] = useState<LoginAttempt | null>(null)
  useEffect(() => {
    const saved = loadLoginAttempt()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser, after hydration
    if (saved) setAttempt(saved)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pt-7 pb-8">
      {attempt ? (
        <CodeStep
          attempt={attempt}
          onAttemptChange={setAttempt}
          onChangeEmail={() => setAttempt(null)}
        />
      ) : (
        <EmailStep next={next} authFailed={authFailed} onSent={setAttempt} />
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFlow />
    </Suspense>
  )
}
