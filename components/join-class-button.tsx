'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CodeJoinForm } from '@/components/code-join-form'
import { secondaryButtonClass } from '@/components/buttons'

// ＋ クラスに参加, like Google Classroom's ＋ (2026-11-06): opens the class
// code form in a modal <dialog> from anywhere it sits (Home, クラス). An
// account that may create classes (0015) also gets クラスを作る beside it.
export function JoinClassButton({ canCreate = false }: { canCreate?: boolean }) {
  const t = useTranslations('joinClass')
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" className={secondaryButtonClass} onClick={() => dialogRef.current?.showModal()}>
        ＋ {t('button')}
      </button>
      {canCreate && (
        <Link href="/classes#create-class" className={secondaryButtonClass}>
          ＋ {t('create')}
        </Link>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="join-class-title"
        className="quick-sheet m-auto w-[min(440px,calc(100vw-32px))] rounded-[24px] bg-surface p-6 text-ink backdrop:bg-black/40"
        // A click on the backdrop (the dialog itself, outside its content) closes it.
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="join-class-title" className="font-heading text-xl leading-8 font-bold">
                {t('title')}
              </h2>
              <p className="text-sm leading-6 text-muted">{t('why')}</p>
            </div>
            <button
              type="button"
              aria-label={t('close')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container"
              onClick={() => dialogRef.current?.close()}
            >
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <CodeJoinForm />
        </div>
      </dialog>
    </div>
  )
}
