'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PRIVACY_POLICY_PATH } from '@/lib/contact'
import { loadLoginAttempt, type LoginAttempt } from '@/lib/auth/login-code'
import { safeNextPath } from '@/lib/auth/next-path'
import { clearAll } from '@/lib/local-draft'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'

function LoginFlow() {
  const t = useTranslations('publicFooter')
  const searchParams = useSearchParams()
  const authFailed = searchParams.get('error') === 'auth_failed'
  const next = safeNextPath(searchParams.get('next'))

  // Set once the code is sent. Restored from sessionStorage, so a phone
  // reloading this tab after a trip to the mail app lands back on the code
  // screen instead of starting over.
  const [attempt, setAttempt] = useState<LoginAttempt | null>(null)

  // Nobody is signed in here: unsaved writing left in this browser (Prompt
  // 12) belongs to whoever used it last, so it goes. Sign-out clears it too;
  // this covers signing out without JavaScript and expired sessions.
  useEffect(() => {
    void clearAll()
  }, [])

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
      <p className="mt-2 text-sm">
        <Link href={PRIVACY_POLICY_PATH} className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-4">
          {t('privacy')}
        </Link>
      </p>
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
