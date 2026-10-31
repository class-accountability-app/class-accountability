'use client'

import { useActionState, useId, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import type { ActionResult } from '@/lib/errors'
import { lineShareUrl } from '@/lib/team-invite'
import { renewTeamCode } from '@/app/team/actions'

// チームに招待する (0028): the team's code, its QR and the link. Teams form
// face to face in class: a classmate scans the QR or types the code. Shown to
// the pod's members while there is room (under 6).
const noSubscribe = () => () => {}
const browserCanShare = () => typeof navigator.share === 'function'

export function TeamInviteCard({
  podId,
  classId,
  url,
  shortUrl,
  grouped,
  qrSvg,
  className,
  projectTitle,
  small = false,
}: {
  podId: string
  classId: string
  url: string
  shortUrl: string
  grouped: string
  qrSvg: string
  className: string
  projectTitle?: string | null
  small?: boolean
}) {
  const t = useTranslations('teamInvite')
  const id = useId()
  const [announcement, setAnnouncement] = useState('')
  const [state, renew, renewing] = useActionState<ActionResult, FormData>(renewTeamCode, { error: null })

  const message = projectTitle
    ? t('messageProject', { className, project: projectTitle, url })
    : t('message', { className, url })
  // False on the server and in the first render, so hydration matches.
  const canShare = useSyncExternalStore(noSubscribe, browserCanShare, () => false)

  async function copy(text: string, done: string) {
    setAnnouncement('')
    try {
      await navigator.clipboard.writeText(text)
      requestAnimationFrame(() => setAnnouncement(done))
    } catch {
      requestAnimationFrame(() => setAnnouncement(t('copyFailed', { url: shortUrl })))
    }
  }

  // The phone's own share sheet (LINE, Instagram, mail...). Cancelling it
  // is not an error; anything else falls back to copying the message.
  async function share() {
    try {
      await navigator.share({ text: message })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') await copy(message, t('messageCopied'))
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="rule-card flex flex-col px-3.5 py-3.5">
      <h2 id={`${id}-heading`} className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('heading')}
      </h2>
      {small && <p className="text-[13px] leading-7 font-semibold text-ink">{t('smallTeam')}</p>}
      <p className="text-[13px] leading-7 text-muted">{t('body')}</p>
      <p className="sr-only">{t('messageLabel')}</p>
      <p className="mt-1.5 rounded-lg bg-surface px-3 py-1.5 text-[13px] leading-6 text-ink shadow-[inset_0_0_0_1px_var(--border)] [overflow-wrap:anywhere]">
        {message}
      </p>
      <div className="flex flex-wrap gap-2 pt-3.5">
        {canShare && (
          <button type="button" onClick={share} className={primaryButtonClass}>
            {t('share')}
          </button>
        )}
        <a
          href={lineShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          className={canShare ? secondaryButtonClass : primaryButtonClass}
        >
          {t('shareLine')}
        </a>
        <button type="button" onClick={() => copy(message, t('messageCopied'))} className={secondaryButtonClass}>
          {t('copyMessage')}
        </button>
      </div>
      <div className="flex items-center gap-4 py-3.5">
        <div
          role="img"
          aria-label={t('qrLabel', { url: shortUrl })}
          className="w-[126px] shrink-0 rounded-lg border border-border bg-surface p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="flex min-w-0 flex-col">
          <p className="font-meta text-xs leading-7 text-muted">{t('codeLabel')}</p>
          <p className="font-meta text-xl leading-7 font-bold tracking-[0.08em] text-ink">{grouped}</p>
          <button
            type="button"
            onClick={() => copy(url, t('copied'))}
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
