import { PageTransition } from '@/components/page-transition'

// See components/page-transition.tsx.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
