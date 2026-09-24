'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FieldError, FormError, describedField } from '@/components/form-errors'
import { loginErrorKeyFor, type ErrorKey } from '@/lib/errors'
import { saveLoginAttempt, type LoginAttempt } from '@/lib/auth/login-code'
import { sendLoginCode } from './send-code'

// Screen 01: ask for the university email and send the code.
export function EmailStep({
  next,
  authFailed,
  onSent,
}: {
  next: string
  authFailed: boolean
  onSent: (attempt: LoginAttempt) => void
}) {
  const t = useTranslations('login')
  const tCommon = useTranslations('common')

  const emailRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (error) emailRef.current?.focus()
  }, [error])

  // No domain check here: the signup trigger enforces the domain, and
  // loginErrorKeyFor turns its failure into the friendly message. Checking
  // first would lock out any older account on another domain.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    setError(null)
    const address = email.trim()
    if (!address) {
      setError('emailInvalid')
      return
    }

    startTransition(async () => {
      const { error } = await sendLoginCode(address, next)
      if (error) {
        setError(loginErrorKeyFor(error, address))
        return
      }
      const attempt = { email: address, sentAt: Date.now(), next }
      saveLoginAttempt(attempt)
      onSent(attempt)
    })
  }

  return (
    <>
      <p className="font-meta text-sm text-muted">{t('eyebrow')}</p>
      <h1 className="font-heading text-[27px] leading-snug font-bold text-ink">{t('title')}</h1>
      <p className="text-[15px] text-ink/85">{t('intro')}</p>

      {authFailed && <FormError error="authFailed" />}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor="login-email" className="text-sm font-semibold text-ink">
            {t('emailLabel')}
          </label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            {...describedField(error, 'login-email-error', 'login-email-hint')}
            className="h-12 w-full rounded-[2px] border border-border bg-surface px-3.5 text-ink placeholder:text-muted"
          />
          <FieldError id="login-email-error" error={error} />
          <p id="login-email-hint" className="text-[13px] text-muted">
            {t('emailHint')}
          </p>
        </div>
        <button
          type="submit"
          aria-busy={isPending || undefined}
          className="btn mt-2 flex h-13 w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white"
        >
          {isPending ? tCommon('sending') : t('submit')}
        </button>
      </form>
    </>
  )
}
