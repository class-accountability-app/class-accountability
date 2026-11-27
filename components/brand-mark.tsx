// The Study Pods mark (chosen 2026-11-27, replacing the sp letters of
// 2026-11-06): a pea pod, tilted as if just picked, with four peas showing
// through; the last pea is Penna, "you". The same drawing as
// docs/icons/sp-mark.svg, which every app icon is rendered from
// (scripts/make-icons.mjs). Colours come from the tokens in app/globals.css.
export function PodMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" className={className}>
      <rect x="4" y="4" width="92" height="92" rx="26" fill="var(--tint-hudson)" />
      <g transform="translate(-2.2 6.5) rotate(-25 50 50)">
        <path d="M10 50 Q50 20 90 50 Q50 80 10 50 Z" fill="var(--ink)" />
        <path d="M89 49 q7 -2 8 -10" fill="none" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
        <circle cx="30" cy="50" r="6.2" fill="var(--tint-hudson)" />
        <circle cx="44" cy="50" r="6.2" fill="var(--tint-hudson)" />
        <circle cx="58" cy="50" r="6.2" fill="var(--tint-hudson)" />
        <circle cx="72" cy="50" r="6.2" fill="var(--tint-penna)" />
      </g>
    </svg>
  )
}
