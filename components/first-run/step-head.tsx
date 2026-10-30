import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

// The top of a first-run step: a way back (when going back makes sense), the
// step number as text, and three bars. The number is the information; the
// bars only decorate (their quiet colour would not pass as a 3:1 graphic).
export async function StepHead({ step, backHref }: { step: 1 | 2 | 3; backHref?: string }) {
  const t = await getTranslations('firstRun')
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-accent-text underline-offset-4 hover:underline"
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
            {t('back')}
          </Link>
        ) : (
          <span />
        )}
        <p className="font-meta text-[13px] leading-7 font-bold text-ink">
          <span aria-hidden>{t('step', { n: step })}</span>
          <span className="sr-only">{t('stepLabel', { n: step })}</span>
        </p>
      </div>
      <div aria-hidden className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((i) => (
          <i key={i} className={`h-1.5 rounded-lg ${i <= step ? 'bg-ink' : 'bg-border'}`} />
        ))}
      </div>
    </div>
  )
}
