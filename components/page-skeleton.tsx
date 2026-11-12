import { useTranslations } from 'next-intl'

// What a page shows while its data loads (the loading.tsx files): the shape
// of a page (a title and a few cards) in quiet grey, so a tap answers at once
// instead of the old page sitting still. Screen readers hear 読み込み中 once;
// the pulse stops under reduced motion.
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  const t = useTranslations('common')
  return (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6" role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto flex w-full max-w-md flex-col gap-7 motion-safe:animate-pulse md:max-w-xl lg:max-w-4xl">
        <div className="flex flex-col gap-3 px-0.5">
          <div className="h-4 w-28 rounded-full bg-surface-container" />
          <div className="h-9 w-2/3 rounded-full bg-surface-container" />
        </div>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="rule-card flex flex-col gap-3 px-5 py-5">
            <div className="h-5 w-1/3 rounded-full bg-surface-container" />
            <div className="h-4 w-full rounded-full bg-surface-container" />
            <div className="h-4 w-4/5 rounded-full bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  )
}
