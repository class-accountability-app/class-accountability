'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { secondaryButtonClass } from '@/components/buttons'

// A one-time notice for students (2026-11-14, with 0046): the teacher can now
// see each team's project board. It stays until the student taps わかりました;
// the dismissal lives in this device's localStorage, like the push card's.
const SEEN_KEY = 'sp-notice-teacher-board'

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function TeacherViewNotice() {
  const t = useTranslations('teacherViewNotice')
  // Hidden on the server and until storage is read, so nothing flashes for a
  // student who already dismissed it.
  const [seen, setSeen] = useState(() => typeof window === 'undefined' || readSeen())
  if (seen) return null

  return (
    <section aria-labelledby="teacher-view-notice" className="rule-card tint-hudson flex flex-col gap-2 px-5 py-5">
      <h2 id="teacher-view-notice" className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('title')}
      </h2>
      <p className="text-sm leading-7 text-ink">{t('body')}</p>
      <p className="text-sm leading-7 text-ink">{t('notSeen')}</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => {
            try {
              localStorage.setItem(SEEN_KEY, '1')
            } catch {
              // Private mode: the notice shows again next time.
            }
            setSeen(true)
          }}
        >
          {t('ok')}
        </button>
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4">
          {t('policy')}
        </Link>
      </div>
    </section>
  )
}
