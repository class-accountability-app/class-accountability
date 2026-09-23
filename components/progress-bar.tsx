// A fill-toward-a-goal progress bar for numeric target types (word_count,
// study_hours, character_count) — not used for the binary `task` type.
//
// The visual fill is capped at 100% even when `value` exceeds `max`, but the
// accessible value is not: `aria-valuetext` always carries the real,
// uncapped label (e.g. "1200 / 1000 characters") so a screen-reader user
// isn't given a less accurate number than the text line already visible to
// a sighted user. `aria-valuenow` is still clamped to `max` to stay spec
// -compliant (ARIA expects valuenow within [valuemin, valuemax]); valuetext
// takes precedence over it for what's actually announced.
export function ProgressBar({
  value,
  max,
  valueText,
}: {
  value: number
  max: number
  valueText: string
}) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className="h-1.5 w-full overflow-hidden rounded-[2px] bg-border"
    >
      <div className="progress-bar-fill h-full bg-ink" style={{ width: `${pct}%` }} />
    </div>
  )
}
