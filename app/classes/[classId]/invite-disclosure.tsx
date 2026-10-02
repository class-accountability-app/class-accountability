'use client'

import { useEffect, useRef } from 'react'
import { secondaryButtonClass } from '@/components/buttons'

// 仲間を招待する on the class page (Prompt 11b): the join link and QR stay
// behind one button, so they don't fill the screen above the pod. A native
// <details>, so it works before JavaScript loads; it opens by itself when
// 次にやること links here (#invite).
export function InviteDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function openOnHash() {
      if (window.location.hash === '#invite' && ref.current) ref.current.open = true
    }
    openOnHash()
    window.addEventListener('hashchange', openOnHash)
    return () => window.removeEventListener('hashchange', openOnHash)
  }, [])

  return (
    <details ref={ref} className="group flex flex-col">
      <summary className={`${secondaryButtonClass} my-1.5 cursor-pointer list-none self-start [&::-webkit-details-marker]:hidden`}>
        {label}
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent-text transition-transform group-open:rotate-90"
        >
          <path d="M8 4.5L13.5 10 8 15.5" />
        </svg>
      </summary>
      <div className="pt-1.5 pb-7">{children}</div>
    </details>
  )
}
