'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { FormError } from '@/components/form-errors'
import type { ActionResult } from '@/lib/errors'
import { joinClassByCode } from './actions'

// A form, not a click handler, so the button works before hydration too
// (students open this from a QR code on a phone, often on a slow network).
export function JoinForm({ code }: { code: string }) {
  const t = useTranslations('join')
  const [state, action, isPending] = useActionState<ActionResult, FormData>(joinClassByCode, {
    error: null,
  })

  return (
    <form action={action} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={isPending}
        className="btn flex h-[52px] w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white disabled:opacity-50"
      >
        {isPending ? t('joining') : t('submit')}
      </button>
      <Link
        href="/"
        className="flex h-12 w-full items-center justify-center rounded-[2px] border border-border bg-surface text-[15px] font-semibold text-ink"
      >
        {t('cancel')}
      </Link>
      <FormError error={state.error} />
    </form>
  )
}
