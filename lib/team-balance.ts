// The re-balance hint (feature batch 1): when one teammate owns many more
// open tasks than another, the board says so gently. Pure, so it is tested.

export const IMBALANCE_GAP = 3

export type OpenLoad = { id: string; open: number }

// Open (not done) tasks per member, members with none included.
export function openLoads(memberIds: readonly string[], tasks: readonly { owner_id: string | null; status: string }[]): OpenLoad[] {
  return memberIds.map((id) => ({
    id,
    open: tasks.filter((t) => t.owner_id === id && t.status !== 'done').length,
  }))
}

// The busiest and the least busy member, when the gap is IMBALANCE_GAP or
// more; null otherwise (and for a team of one).
export function imbalance(loads: readonly OpenLoad[]): { heavy: OpenLoad; light: OpenLoad } | null {
  if (loads.length < 2) return null
  const sorted = [...loads].sort((a, b) => b.open - a.open || a.id.localeCompare(b.id))
  const heavy = sorted[0]
  const light = sorted[sorted.length - 1]
  return heavy.open - light.open >= IMBALANCE_GAP ? { heavy, light } : null
}
