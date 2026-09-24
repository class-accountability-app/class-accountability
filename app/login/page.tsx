'use client'

import { Suspense, useEffect, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { loginErrorKeyFor, type ErrorKey } from '@/lib/errors'

function LoginForm() {
  const t = useTranslations('login')
  const tErrors = useTranslations('errors')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()
  const authFailed = searchParams.get('error') === 'auth_failed'

  const emailRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (error) emailRef.current?.focus()
  }, [error])

  // Runs in the browser on purpose: each student's request reaches Supabase
  // from their own IP, so Supabase's per-IP auth limits apply per student,
  // not to the whole class behind Vercel's IPs.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const address = email.trim()
    if (!address) {
      setError('emailInvalid')
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(loginErrorKeyFor(error, address))
        return
      }
      setSent(true)
    })
  }

  if (sent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <h1 className="font-heading text-xl font-semibold text-ink">{t('sentTitle')}</h1>
        <p className="text-sm text-muted">{t('sentBody', { email })}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
      <h1 className="font-heading text-xl font-semibold text-ink">{t('title')}</h1>

      {authFailed && (
        <p role="alert" className="text-sm text-red-700">
          {tErrors('authFailed')}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-email" className="text-sm font-medium text-ink">
            {t('emailLabel')}
          </label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-email-error login-email-hint' : 'login-email-hint'}
            className="rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted"
          />
          {error && (
            <p id="login-email-error" className="text-sm text-red-700">
              {tErrors(error)}
            </p>
          )}
          <p id="login-email-hint" className="text-xs text-muted">
            {t('emailHint')}
          </p>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? tCommon('sending') : t('submit')}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
