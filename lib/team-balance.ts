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

// みんなに割りふる: hand the tasks nobody has taken to the team, one at a time,
// each to whoever has the fewest open tasks at that moment (ties go to the
// earlier member in the list), so the loads end up as even as they can be.
// Tasks keep their order; nothing already owned is touched.
export function shareOut(unownedTaskIds: readonly string[], loads: readonly OpenLoad[]): { taskId: string; ownerId: string }[] {
  if (loads.length === 0) return []
  const open = loads.map((l) => ({ ...l }))
  return unownedTaskIds.map((taskId) => {
    let pick = open[0]
    for (const l of open) if (l.open < pick.open) pick = l
    pick.open++
    return { taskId, ownerId: pick.id }
  })
}
