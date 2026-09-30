'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { promptInstall, useInstallHint } from '@/components/pwa'

// 設定's 「ホーム画面に追加」 row (lib/install-hint.ts decides which kind).
// Hidden when already installed or when this browser can't install; renders
// nothing until hydrated, so it never flashes the wrong kind.
export function InstallRow({ rowClass }: { rowClass: string }) {
  const t = useTranslations('settings.install')
  const hint = useInstallHint()
  const [open, setOpen] = useState(false)
  const stepsId = useId()

  if (hint === null || hint === 'installed' || hint === 'none') return null

  const row = `${rowClass} border-b border-dashed border-[#e3d4b0] text-ink text-left`

  if (hint === 'prompt') {
    return (
      <button type="button" onClick={() => void promptInstall()} className={row}>
        {t('row')}
        <PlusIcon />
      </button>
    )
  }

  // iPhone steps, or "open this in Safari / a browser first": both expand in place.
  return (
    <div className="border-b border-dashed border-[#e3d4b0]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={stepsId}
        onClick={() => setOpen((v) => !v)}
        className={`${rowClass} text-left text-ink`}
      >
        {t('row')}
        <Chevron open={open} />
      </button>
      <div id={stepsId} hidden={!open} className="pb-4 text-sm leading-[1.8] text-ink">
        {hint === 'ios' ? (
          <>
            <p className="text-muted">{t('iosIntro')}</p>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1.5 pl-5">
              <li>
                {t.rich('iosStep1', {
                  icon: () => <ShareIcon />,
                })}
              </li>
              <li>{t('iosStep2')}</li>
              <li>{t('iosStep3')}</li>
            </ol>
          </>
        ) : (
          <p>{hint === 'ios-in-app' ? t('iosInApp') : t('inApp')}</p>
        )}
      </div>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      width="14"
      height="8"
      viewBox="0 0 16 10"
      fill="none"
      stroke="var(--muted)"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={open ? 'rotate-180' : ''}
    >
      <path d="M2 2l6 6 6-6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 1v12M1 7h12" />
    </svg>
  )
}

// iOS's share icon: a square with an arrow out of the top.
function ShareIcon() {
  return (
    <svg
      aria-hidden
      width="15"
      height="18"
      viewBox="0 0 15 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-0.5 inline-block -translate-y-0.5 align-middle"
    >
      <path d="M7.5 1v10M4 4.5L7.5 1 11 4.5" />
      <path d="M5 7H2v10h11V7h-3" />
    </svg>
  )
}
