'use client'

import { useEffect, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'

// Error under a field. The field points at it with aria-describedby, and
// role="alert" announces it when it appears, also when focus doesn't move
// (e.g. the nudge limit, which comes back from the server after sending).
// Where useFocusFirstInvalid also moves focus to the field, some screen
// readers read it twice; heard twice beats not heard at all.
export function FieldError({ id, error }: { id: string; error: ErrorKey | undefined | null }) {
  const t = useTranslations('errors')
  if (!error) return null
  return (
    <p id={id} role="alert" className="text-sm text-red-700">
      {t(error)}
    </p>
  )
}

// Error not tied to one field (e.g. "Something went wrong").
export function FormError({ error }: { error: ErrorKey | null }) {
  const t = useTranslations('errors')
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-red-700">
      {t(error)}
    </p>
  )
}

// Props for a field: marks it invalid and links its error text (and any hint).
export function describedField(error: ErrorKey | undefined | null, errorId: string, hintId?: string) {
  const describedBy = [error ? errorId : null, hintId].filter(Boolean).join(' ')
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  }
}

// After a failed submit, move focus to the first invalid field so screen
// readers announce its error.
export function useFocusFirstInvalid(
  containerRef: RefObject<HTMLElement | null>,
  trigger: unknown
) {
  useEffect(() => {
    if (!trigger) return
    containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [containerRef, trigger])
}
