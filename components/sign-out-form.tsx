'use client'

import { useRef, type ReactNode } from 'react'
import { releaseThisDevice } from '@/components/push'

// Log out (設定 and the header). Before the form goes to /auth/signout, this
// browser's push subscription is dropped and its endpoint sent along, so the
// route deletes the row while the student is still signed in: a shared phone
// never gets the previous student's nudges. Without JavaScript it is a plain
// form and still signs out.
export function SignOutForm({
  className,
  buttonClassName,
  children,
}: {
  className?: string
  buttonClassName: string
  children: ReactNode
}) {
  const endpointRef = useRef<HTMLInputElement>(null)
  const releasing = useRef(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (releasing.current) return
    releasing.current = true
    const form = e.currentTarget
    const endpoint = await releaseThisDevice()
    if (endpointRef.current) endpointRef.current.value = endpoint ?? ''
    form.submit()
  }

  return (
    <form action="/auth/signout" method="post" className={className} onSubmit={handleSubmit}>
      <input ref={endpointRef} type="hidden" name="push_endpoint" defaultValue="" />
      <button type="submit" className={buttonClassName}>
        {children}
      </button>
    </form>
  )
}
