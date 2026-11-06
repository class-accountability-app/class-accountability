// The Study Pods mark (chosen 2026-11-06): a lower-case s and a p whose
// bowl is a pea, Umbra on Hudson. The same drawing as docs/icons/sp-mark.svg,
// which every app icon is rendered from (scripts/make-icons.mjs).
const S_PATH =
  'M231 -12Q188 -12 146.5 -1.0Q105 10 69.5 30.5Q34 51 9 78L96 166Q120 140 153.0 125.5Q186 111 225 111Q252 111 266.5 119.0Q281 127 281 141Q281 159 263.5 168.5Q246 178 219.0 185.5Q192 193 162.0 202.0Q132 211 105.0 227.0Q78 243 61.0 271.5Q44 300 44 344Q44 391 68.0 425.5Q92 460 136.0 480.0Q180 500 239 500Q301 500 353.5 478.5Q406 457 439 415L352 327Q329 354 300.5 365.0Q272 376 245 376Q219 376 206.0 368.5Q193 361 193 347Q193 332 210.0 323.0Q227 314 254.0 307.0Q281 300 311.0 290.0Q341 280 368.0 263.0Q395 246 412.0 217.5Q429 189 429 143Q429 72 375.5 30.0Q322 -12 231 -12Z'

export function SpMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" className={className}>
      <rect x="4" y="4" width="92" height="92" rx="26" fill="var(--tint-hudson)" />
      <path transform="translate(22 60) scale(0.05 -0.05)" fill="var(--ink)" d={S_PATH} />
      <rect x="51" y="35" width="9" height="45" rx="4.5" fill="var(--ink)" />
      <circle cx="67" cy="47" r="12" fill="var(--ink)" />
    </svg>
  )
}
