'use client'

import { useLayoutEffect, useRef } from 'react'

const RULE = 28 // --rule in globals.css

// For a block on the ruled page whose height can't be built from 28px lines
// in CSS alone (a form with its own field heights and error messages): pads
// it to the next whole line, so whatever comes below stays on the rule.
// Measured before paint, so there's no visible jump; re-measured when its
// content changes size (an error appearing).
export function RuleSnap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const inner = el.firstElementChild as HTMLElement | null
    if (!inner) return
    const snap = () => {
      const height = inner.getBoundingClientRect().height
      el.style.height = `${Math.ceil(height / RULE) * RULE}px`
    }
    snap()
    const observer = new ResizeObserver(snap)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref}>
      <div>{children}</div>
    </div>
  )
}
