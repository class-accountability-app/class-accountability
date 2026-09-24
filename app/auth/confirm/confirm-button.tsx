'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { FormError } from '@/components/form-errors'
import { confirmOutcomeFor, type ErrorKey } from '@/lib/errors'
import { clearLoginAttempt, confirmTypeFrom } from '@/lib/auth/login-code'
import { nextFromRedirectTo } from '@/lib/auth/next-path'

function Stamp({ tone }: { tone: 'ready' | 'used' }) {
  const color = tone === 'ready' ? 'border-status-active' : 'border-status-stale'
  const dot = tone === 'ready' ? 'bg-status-active' : 'bg-status-stale'
  return (
    <span
      aria-hidden
      className={`inline-flex size-[30px] shrink-0 -rotate-[7deg] items-center justify-center rounded-full border-[1.5px] ${color}`}
    >
      <span className={`size-2.5 rounded-full ${dot}`} />
    </span>
  )
}

// Screen 14 (press to log in) and screen 15 (this button no longer works).
export function ConfirmButton() {
  const t = useTranslations('confirm')
  const searchParams = useSearchParams()

  // Read the link once. The token hash is then removed from the address bar
  // (below), so these must not follow later changes to the URL.
  const [link] = useState(() => ({
    tokenHash: searchParams.get('token_hash'),
    type: confirmTypeFrom(searchParams.get('type')),
    next: nextFromRedirectTo(searchParams.get('next')),
  }))
  const usable = Boolean(link.tokenHash && link.type)

  const [expired, setExpired] = useState(!usable)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // A ref as well as state: a double tap fires twice before a re-render.
  const submittingRef = useRef(false)
  const expiredHeadingRef = useRef<HTMLHeadingElement>(null)

  // Keep the token hash out of browser history and anything copied from the
  // address bar. The page already holds it in `link`.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // When a press turns into screen 15, move focus to its heading so screen
  // readers announce the change.
  useEffect(() => {
    if (expired && usable) expiredHeadingRef.current?.focus()
  }, [expired, usable])

  async function handleConfirm() {
    if (submittingRef.current || !link.tokenHash || !link.type) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)

    // In the browser, so Supabase's per-IP limit applies to this student.
    // token_hash doesn't need the PKCE code verifier, so this works in any
    // browser, including one that never started the login.
    const { error } = await createClient().auth.verifyOtp({
      token_hash: link.tokenHash,
      type: link.type,
    })
    if (error) {
      submittingRef.current = false
      setSubmitting(false)
      const outcome = confirmOutcomeFor(error)
      if (outcome === 'expired') setExpired(true)
      else setError(outcome)
      return
    }

    // If this browser also has the code screen open, that attempt is done.
    clearLoginAttempt()
    window.location.replace(link.next)
  }

  const cardClass =
    'mt-6 flex flex-col gap-4 rounded-[2px] border border-border bg-surface px-[22px] py-7'
  const primaryClass =
    'btn mt-1 flex h-13 w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white no-underline'

  if (expired) {
    const newCodeHref = link.next === '/' ? '/login' : `/login?next=${encodeURIComponent(link.next)}`
    return (
      <div className="mx-auto flex w-full max-w-md flex-col px-5 pt-7 pb-8">
        <div className={cardClass}>
          <div className="flex items-center gap-2.5">
            <Stamp tone="used" />
            <p className="font-meta text-sm text-muted">{t('expiredEyebrow')}</p>
          </div>
          <h1
            ref={expiredHeadingRef}
            tabIndex={-1}
            className="font-heading text-[27px] leading-snug font-bold text-ink outline-none"
          >
            {t('expiredTitle')}
          </h1>
          <p className="text-[15px] text-ink/85">{t('expiredBody')}</p>
          <Link href={newCodeHref} className={primaryClass}>
            {t('newCode')}
          </Link>
          <Link
            href="/"
            className="flex h-12 w-full items-center justify-center rounded-[2px] border border-border bg-surface text-[15px] font-semibold text-ink no-underline"
          >
            {t('openHome')}
          </Link>
          <p className="text-[13px] text-muted">{t('expiredHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pt-7 pb-8">
      <div className={cardClass}>
        <div className="flex items-center gap-2.5">
          <Stamp tone="ready" />
          <p className="font-meta text-sm text-muted">{t('eyebrow')}</p>
        </div>
        <h1 className="font-heading text-[27px] leading-snug font-bold text-ink">{t('title')}</h1>
        <p className="text-[15px] text-ink/85">{t('body')}</p>
        <button
          type="button"
          onClick={handleConfirm}
          aria-busy={submitting || undefined}
          className={primaryClass}
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
        <FormError error={error} />
        <p className="text-[13px] text-muted">{t('ignore')}</p>
      </div>
    </div>
  )
}
