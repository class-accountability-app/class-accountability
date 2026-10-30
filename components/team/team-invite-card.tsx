'use client'

import { useActionState, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FormError } from '@/components/form-errors'
import type { ActionResult } from '@/lib/errors'
import { renewTeamCode } from '@/app/team/actions'

// チームに招待する (0028): the team's code, its QR and the link. Teams form
// face to face in class: a classmate scans the QR or types the code. Shown to
// the pod's members while there is room (under 6).
export function TeamInviteCard({
  podId,
  classId,
  url,
  shortUrl,
  grouped,
  qrSvg,
}: {
  podId: string
  classId: string
  url: string
  shortUrl: string
  grouped: string
  qrSvg: string
}) {
  const t = useTranslations('teamInvite')
  const id = useId()
  const [announcement, setAnnouncement] = useState('')
  const [state, renew, renewing] = useActionState<ActionResult, FormData>(renewTeamCode, { error: null })

  async function copy() {
    setAnnouncement('')
    try {
      await navigator.clipboard.writeText(url)
      requestAnimationFrame(() => setAnnouncement(t('copied')))
    } catch {
      requestAnimationFrame(() => setAnnouncement(t('copyFailed', { url: shortUrl })))
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="rule-card flex flex-col px-3.5 py-3.5">
      <h2 id={`${id}-heading`} className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('heading')}
      </h2>
      <p className="text-[13px] leading-7 text-muted">{t('body')}</p>
      <div className="flex items-center gap-4 py-3.5">
        <div
          role="img"
          aria-label={t('qrLabel', { url: shortUrl })}
          className="w-[126px] shrink-0 rounded-[2px] border border-border bg-[#fffdf7] p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="flex min-w-0 flex-col">
          <p className="font-meta text-xs leading-7 text-muted">{t('codeLabel')}</p>
          <p className="font-meta text-xl leading-7 font-bold tracking-[0.08em] text-ink">{grouped}</p>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            {t('copy')}
          </button>
        </div>
      </div>
      <p aria-live="polite" className="min-h-7 text-xs leading-7 text-muted">
        {announcement}
      </p>
      <form action={renew}>
        <input type="hidden" name="podId" value={podId} />
        <input type="hidden" name="classId" value={classId} />
        <button
          type="submit"
          disabled={renewing}
          className="inline-flex min-h-11 items-center text-[13px] text-muted underline underline-offset-4 disabled:opacity-50"
        >
          {t('renew')}
        </button>
        <FormError error={state.error} />
      </form>
    </section>
  )
}
