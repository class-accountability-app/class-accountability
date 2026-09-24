'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { FieldError, FormError, describedField } from '@/components/form-errors'
import { codeErrorKeyFor, resendErrorKeyFor, type ErrorKey } from '@/lib/errors'
import {
  CODE_LENGTH,
  clearLoginAttempt,
  isCompleteCode,
  normalizeCode,
  saveLoginAttempt,
  secondsUntilResend,
  type LoginAttempt,
} from '@/lib/auth/login-code'
import { OUTLOOK_INBOX_URL, gmailInboxUrl } from '@/lib/auth/mail-links'
import { sendLoginCode } from './send-code'

// Screen 02: enter the 6-digit code from the email, in the tab that asked for it.
export function CodeStep({
  attempt,
  onAttemptChange,
  onChangeEmail,
}: {
  attempt: LoginAttempt
  onAttemptChange: (attempt: LoginAttempt) => void
  onChangeEmail: () => void
}) {
  const t = useTranslations('login')
  const tCommon = useTranslations('common')

  const codeRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [verifying, setVerifying] = useState(false)
  // A ref as well as state: two quick submits (auto-verify plus a tap on the
  // button) happen before a re-render, so state alone can't stop the second.
  const verifyingRef = useRef(false)
  // The last code verified automatically, so a wrong code isn't retried on
  // every re-render; typing a different code verifies again.
  const autoTriedRef = useRef('')

  const [now, setNow] = useState(() => Date.now())
  const secondsLeft = secondsUntilResend(attempt.sentAt, now)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState<ErrorKey | null>(null)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    codeRef.current?.focus()
  }, [])

  // Tick once a second while the resend countdown runs.
  useEffect(() => {
    if (secondsLeft === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [secondsLeft])

  async function verify(token: string) {
    if (verifyingRef.current) return
    if (!isCompleteCode(token)) {
      setError('codeFormat')
      codeRef.current?.focus()
      return
    }

    verifyingRef.current = true
    setVerifying(true)
    setError(null)
    // In the browser, like signInWithOtp: Supabase's per-IP limit on
    // verifications then applies to each student, not to the whole class.
    const { error } = await createClient().auth.verifyOtp({
      email: attempt.email,
      token,
      type: 'email',
    })
    if (error) {
      verifyingRef.current = false
      setVerifying(false)
      setError(codeErrorKeyFor(error))
      codeRef.current?.focus()
      codeRef.current?.select()
      return
    }

    clearLoginAttempt()
    // A full page load, so the server renders the signed-in nav. The button
    // keeps saying ログイン中… until the new page arrives.
    window.location.replace(attempt.next)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = normalizeCode(e.target.value)
    setCode(digits)
    if (error) setError(null)
    if (isCompleteCode(digits) && digits !== autoTriedRef.current) {
      autoTriedRef.current = digits
      void verify(digits)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void verify(code)
  }

  async function handleResend() {
    if (resending) return
    setResending(true)
    setResendError(null)
    setResent(false)
    const { error } = await sendLoginCode(attempt.email, attempt.next)
    setResending(false)
    if (error) {
      setResendError(resendErrorKeyFor(error, attempt.email))
      return
    }
    const updated = { ...attempt, sentAt: Date.now() }
    saveLoginAttempt(updated)
    onAttemptChange(updated)
    setNow(updated.sentAt)
    setResent(true)
    setCode('')
    setError(null)
    autoTriedRef.current = ''
    codeRef.current?.focus()
  }

  return (
    <>
      <p className="font-meta text-sm text-muted">{t('eyebrow')}</p>
      <h1 className="font-heading text-[27px] leading-snug font-bold text-ink">{t('codeTitle')}</h1>
      <p className="text-[15px] text-ink/85">
        {t.rich('codeBody', {
          email: attempt.email,
          strong: (chunks) => <strong className="break-all text-ink">{chunks}</strong>,
        })}
      </p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor="login-code" className="text-sm font-semibold text-ink">
            {t('codeLabel')}
          </label>
          {/* No maxLength: it would cut a pasted "123 456" before the
              spaces are stripped. normalizeCode keeps it to 6 digits.
              The 28px size is set on a wrapper: globals.css gives every input
              font-size max(16px, 1em), which beats a text-* class on the
              input itself. */}
          <div className="text-[28px]">
          <input
            ref={codeRef}
            id="login-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`[0-9]{${CODE_LENGTH}}`}
            required
            readOnly={verifying}
            value={code}
            onChange={handleChange}
            {...describedField(error, 'login-code-error')}
            className="h-15 w-full rounded-[2px] border border-border bg-surface px-3.5 text-center font-meta tracking-[0.5em] text-ink"
          />
          </div>
          <FieldError id="login-code-error" error={error} />
        </div>
        <button
          type="submit"
          aria-busy={verifying || undefined}
          className="btn flex h-13 w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white"
        >
          {verifying ? t('verifying') : t('verify')}
        </button>
      </form>

      {/* Side by side; each wraps onto its own line when narrower than 9rem. */}
      <div className="flex flex-wrap gap-3">
        {[
          { href: gmailInboxUrl(attempt.email), label: t('openInGmail') },
          { href: OUTLOOK_INBOX_URL, label: t('openInOutlook') },
        ].map(({ href, label }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 flex-1 basis-36 items-center justify-center rounded-[2px] border border-border bg-surface px-3 text-center text-[15px] font-semibold text-ink no-underline"
          >
            {label}
            <span className="sr-only">{t('opensInNewTab')}</span>
          </a>
        ))}
      </div>

      <section
        aria-labelledby="login-help-title"
        className="flex flex-col gap-1.5 rounded-[2px] border border-border bg-surface px-4 py-3.5"
      >
        <h2 id="login-help-title" className="text-sm font-semibold text-ink">
          {t('helpTitle')}
        </h2>
        <ul className="list-disc pl-[1.2em] text-[13px] text-ink/85">
          <li>{t('helpSpam')}</li>
          <li>{t('helpTypo')}</li>
        </ul>
        {secondsLeft > 0 ? (
          <p className="mt-1 font-meta text-xs text-muted">{t('resendIn', { seconds: secondsLeft })}</p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            aria-busy={resending || undefined}
            className="mt-1 min-h-11 self-start text-sm text-accent-text underline underline-offset-4"
          >
            {resending ? tCommon('sending') : t('resend')}
          </button>
        )}
        <FormError error={resendError} />
        {/* Rendered empty first, so screen readers announce the text when it appears. */}
        <p role="status" className="text-sm text-ink">
          {resent ? t('resent') : ''}
        </p>
        <button
          type="button"
          onClick={() => {
            clearLoginAttempt()
            onChangeEmail()
          }}
          className="min-h-11 self-start text-sm text-accent-text underline underline-offset-4"
        >
          {t('changeEmail')}
        </button>
      </section>
    </>
  )
}
