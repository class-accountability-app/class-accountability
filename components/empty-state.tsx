import type { ReactNode } from 'react'

// Full-width primary action, as in the mockups' empty states (12-nudges-empty).
export const emptyActionClass =
  'btn flex min-h-12 w-full items-center justify-center rounded-[2px] bg-accent px-4 text-[15px] font-semibold text-white'

export type Illustration = 'nudges' | 'classes' | 'pod' | 'target' | 'log' | 'notFound'

// Small line drawings in the mockup style: muted 1.5px ink, with one dashed
// accent stroke for the "not there yet" part.
function Drawing({ name }: { name: Illustration }) {
  const accent = { stroke: 'var(--accent-text)', strokeDasharray: '3 4' }
  return (
    <svg
      aria-hidden
      width="84"
      height="64"
      viewBox="0 0 84 64"
      fill="none"
      stroke="var(--muted)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'nudges' && (
        <>
          <path d="M6 8h48v30H26l-12 10V38H6z" />
          <path d="M16 18h28M16 27h18" />
          <path d="M62 22h16v22h-6v8l-9-8h-1" {...accent} />
        </>
      )}
      {name === 'classes' && (
        <>
          <path d="M10 12h24a6 6 0 0 1 6 6v36a4 4 0 0 0-4-4H10z" />
          <path d="M70 12H46a6 6 0 0 0-6 6v36a4 4 0 0 1 4-4h26z" />
          <path d="M17 22h14M17 30h10M49 22h14" />
          <path d="M49 30h10M49 38h12" {...accent} />
        </>
      )}
      {name === 'pod' && (
        <>
          <circle cx="24" cy="24" r="8" />
          <path d="M10 52c0-9 6-15 14-15s14 6 14 15" />
          <circle cx="56" cy="24" r="8" {...accent} />
          <path d="M42 52c0-9 6-15 14-15s14 6 14 15" {...accent} />
        </>
      )}
      {name === 'target' && (
        <>
          <path d="M8 56h40" />
          <path d="M20 56V8" />
          <path d="M20 10h32l-7 9 7 9H20" {...accent} />
          <path d="M60 56l6-14 6 14M62.5 50h7" />
        </>
      )}
      {name === 'log' && (
        <>
          <path d="M12 8h40v48H12z" />
          <path d="M20 8v48" />
          <path d="M28 20h16M28 28h16" />
          <path d="M28 36h10" {...accent} />
          <path d="M60 50l12-30 5 2-12 30-6 3z" />
        </>
      )}
      {name === 'notFound' && (
        <>
          <path d="M14 6h36l12 12v40H14z" />
          <path d="M50 6v12h12" />
          <path d="M22 44l6-4 6 4 6-4 6 4 6-4 6 4" {...accent} />
          <path d="M31 24a7 7 0 1 1 9 6.7V34M40 38v.5" />
        </>
      )}
    </svg>
  )
}

// Every list that can be empty: a drawing, one short sentence, one button for
// the next step. `title` only where the mockup has one (the 声かけ page).
export function EmptyState({
  illustration,
  title,
  body,
  action,
  headingLevel = 'h2',
}: {
  illustration: Illustration
  title?: string
  body: string
  action?: ReactNode
  headingLevel?: 'h1' | 'h2' | 'h3'
}) {
  const Heading = headingLevel
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-[2px] border border-border bg-surface px-5 py-6 text-center">
      <Drawing name={illustration} />
      {title && <Heading className="font-heading text-lg font-bold text-ink">{title}</Heading>}
      <p className="text-sm text-ink/85">{body}</p>
      {action && <div className="mt-1 w-full">{action}</div>}
    </div>
  )
}
