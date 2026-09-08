// A small hand-stamped status indicator: a rotated ring with a filled dot.
// Color alone never carries the meaning. Pass `label` when no adjacent text
// already says the same thing (it becomes an accessible name); omit it when
// a visible line next to the stamp already covers it, so screen readers
// don't hear the same status announced twice.
export function StatusStamp({
  status,
  label,
  className = '',
}: {
  status: 'active' | 'stale'
  label?: string
  className?: string
}) {
  const color = status === 'active' ? 'var(--status-active)' : 'var(--status-stale)'
  const a11yProps = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true }

  return (
    <span
      {...a11yProps}
      title={label}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ border: `1.5px solid ${color}`, transform: 'rotate(-7deg)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
    </span>
  )
}
