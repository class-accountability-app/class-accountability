'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// クラスに招待する (screen 06): the join link, its QR code, and the
// full-screen view for the classroom projector.
//
// `url` is the full https://…/join/{code} link: what コピー copies, what the
// QR code encodes and what the PNG encodes. `shortUrl` is only for reading.
// `qrSvg` is made on our server (lib/qr.ts); it contains nothing but squares.
export function InviteCard({
  url,
  shortUrl,
  code,
  groupedCode,
  classTitle,
  qrSvg,
}: {
  url: string
  shortUrl: string
  code: string
  groupedCode: string
  classTitle: string
  qrSvg: string
}) {
  const t = useTranslations('invite')
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [announcement, setAnnouncement] = useState('')
  const [presenting, setPresenting] = useState(false)

  async function copy() {
    setAnnouncement('')
    try {
      await navigator.clipboard.writeText(url)
      // A fresh string each time, so pressing twice is announced twice.
      requestAnimationFrame(() => setAnnouncement(t('copied')))
    } catch {
      // No clipboard permission (some in-app browsers): select the link so
      // the student can copy it by hand.
      inputRef.current?.select()
      requestAnimationFrame(() => setAnnouncement(t('copyFailed')))
    }
  }

  async function savePng() {
    const { qrPngDataUrl } = await import('@/lib/qr')
    const link = document.createElement('a')
    link.href = await qrPngDataUrl(url)
    link.download = `study-pods-join-${code}.png`
    link.click()
  }

  const inputId = `${id}-link`

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex w-full flex-col gap-3.5 rounded-[2px] border border-border bg-surface p-5"
    >
      <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-ink">
        {t('heading')}
      </h2>
      <p className="text-sm leading-[1.8] text-ink/85">{t('body')}</p>

      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {t('linkLabel')}
      </label>
      <div className="-mt-2 flex gap-2">
        {/* Shows the short form; コピー copies the full link. */}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          readOnly
          value={shortUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full min-w-0 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 font-meta text-ink"
        />
        <button
          type="button"
          onClick={copy}
          className="btn h-11 shrink-0 rounded-[2px] border border-ink bg-surface px-4 text-sm font-semibold text-ink shadow-[0_2px_0_rgba(58,47,34,0.25)]"
        >
          {t('copy')}
        </button>
      </div>
      <p aria-live="polite" className="-mt-2 min-h-[1lh] text-xs text-muted">
        {announcement}
      </p>

      <div className="flex items-center gap-4">
        <div
          role="img"
          aria-label={t('qrLabel', { url: shortUrl })}
          className="w-[134px] shrink-0 rounded-[2px] border border-border bg-[#fffdf7] p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] leading-[1.6] font-semibold text-muted">{t('qrHint')}</p>
          <button
            type="button"
            onClick={savePng}
            className="min-h-11 self-start px-1 text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            {t('savePng')}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPresenting(true)}
        className="btn flex h-12 w-full items-center justify-center rounded-[2px] border border-ink bg-surface text-[15px] font-semibold text-ink"
      >
        {t('present')}
      </button>

      <p className="text-[13px] leading-[1.7] text-muted">{t('anyMemberCanShare')}</p>

      {presenting && (
        <PresentDialog
          classTitle={classTitle}
          shortUrl={shortUrl}
          groupedCode={groupedCode}
          qrSvg={qrSvg}
          onClose={() => setPresenting(false)}
        />
      )}
    </section>
  )
}

// 授業で映す: the QR code as big as the screen allows, the short link and
// the code in large type. Nothing personal: no member names, no email.
// A native <dialog> opened with showModal() closes on Esc by itself and keeps
// focus inside; it also asks for full screen, and leaving full screen (Esc
// again, or the browser's own control) closes it too.
function PresentDialog({
  classTitle,
  shortUrl,
  groupedCode,
  qrSvg,
  onClose,
}: {
  classTitle: string
  shortUrl: string
  groupedCode: string
  qrSvg: string
  onClose: () => void
}) {
  const t = useTranslations('invite')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    // Full screen is a nicety: some browsers (iOS Safari) refuse, and the
    // dialog already covers the viewport.
    dialog.requestFullscreen?.().catch(() => {})

    function onFullscreenChange() {
      if (!document.fullscreenElement) dialog?.close()
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-[#fffdf7] p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-[2.5vh] px-6 py-6">
        <form method="dialog" className="absolute top-4 right-4">
          <button
            type="submit"
            className="btn min-h-12 rounded-[2px] border border-ink bg-surface px-5 text-base font-semibold text-ink"
          >
            {t('close')}
          </button>
        </form>

        <h2 id={`${id}-title`} className="font-heading text-[clamp(1.5rem,4vh,3rem)] font-bold">
          {classTitle}
        </h2>
        <div
          role="img"
          aria-label={t('qrLabel', { url: shortUrl })}
          className="aspect-square w-[min(62vh,86vw)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="font-meta text-[clamp(1.5rem,5vh,3.5rem)] leading-tight font-bold break-all text-center">
          {shortUrl}
        </p>
        <p className="flex items-baseline gap-4 font-meta leading-none">
          <span className="text-[clamp(1rem,2.6vh,1.75rem)] text-muted">{t('codeLabel')}</span>
          <span className="text-[clamp(2rem,7vh,5rem)] font-bold tracking-[0.12em]">
            {groupedCode}
          </span>
        </p>
      </div>
    </dialog>
  )
}
