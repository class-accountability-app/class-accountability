'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const searchParams = useSearchParams()
  const authFailed = searchParams.get('error') === 'auth_failed'

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <h1 className="font-heading text-xl font-semibold text-ink">Check your inbox</h1>
        <p className="text-sm text-muted">We sent a sign-in link to {email}.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
      <h1 className="font-heading text-xl font-semibold text-ink">Log in</h1>

      {authFailed && (
        <p className="text-sm text-red-700">
          Something went wrong signing you in. Please try again.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@andrew.ac.jp"
          className="rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send link'}
        </button>
        {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
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
