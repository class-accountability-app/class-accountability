import { PageSkeleton } from '@/components/page-skeleton'

// The team board is the heaviest page (tasks, totals, presence, meetings):
// its own skeleton shows at once on a tap from the class page, Home or the
// クラス tab, instead of the old page sitting still (2026-11-16).
export default function Loading() {
  return <PageSkeleton cards={4} />
}
