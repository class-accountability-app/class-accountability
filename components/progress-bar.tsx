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
//
// `ticks` (Prompt 11, Home and the class page) marks 25 / 50 / 75%: a tick
// already passed sits inside the fill, one ahead is a darker notch.
//
// A progressbar needs an accessible name: by default it's the label itself
// (「1,200 / 2,000字（60%）」), so a screen reader hears the numbers once,
// as the bar's name.
const TICKS = [25, 50, 75]

export function ProgressBar({
  value,
  max,
  valueText,
  ticks = false,
}: {
  value: number
  max: number
  valueText: string
  ticks?: boolean
}) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0

  return (
    <div
      role="progressbar"
      aria-label={valueText}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className={`relative w-full overflow-hidden rounded-[2px] bg-border ${ticks ? 'h-2' : 'h-1.5'}`}
    >
      <div className="progress-bar-fill h-full w-full bg-ink" style={{ transform: `scaleX(${pct / 100})` }} />
      {ticks &&
        TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className={`absolute inset-y-0 w-0.5 -translate-x-1/2 ${pct >= tick ? 'bg-surface' : 'bg-[#b9a57c]'}`}
            style={{ left: `${tick}%` }}
          />
        ))}
    </div>
  )
}
