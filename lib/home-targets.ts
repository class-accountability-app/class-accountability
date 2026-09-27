// Home's あなたの目標 (screen 09): unfinished targets first, then finished;
// within each, the nearest deadline first and targets without one last;
// ties keep the order they were created in.

// A handful is what fits on a phone above 参加中のクラス; the rest stay one
// tap away on each class's progress page.
export const HOME_TARGET_LIMIT = 5

export type SortableTarget = {
  deadline: string | null // 'YYYY-MM-DD'
  finished: boolean
  createdAt: string
}

export function sortHomeTargets<T extends SortableTarget>(targets: T[]): T[] {
  return [...targets].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? 1 : -1
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1
      if (b.deadline === null) return -1
      return a.deadline < b.deadline ? -1 : 1
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })
}
