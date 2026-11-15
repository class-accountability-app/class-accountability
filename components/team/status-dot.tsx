import type { MemberState } from '@/lib/team-status'

// One shape per state, so it reads without colour: a filled dot is here now,
// a ring is not, a dashed ring is on a break. Always next to the word.
const DOT: Record<MemberState, string> = {
  online: 'bg-status-active',
  away: 'border-2 border-dashed border-ink/60 bg-surface',
  offline: 'border-2 border-ink/40 bg-surface',
  never: 'border-2 border-ink/20 bg-surface',
}

export function StatusDot({ state, className = '' }: { state: MemberState; className?: string }) {
  return <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full ${DOT[state]} ${className}`} />
}
