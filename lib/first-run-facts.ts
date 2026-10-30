import type { SupabaseClient } from '@supabase/supabase-js'
import { logServerError } from '@/lib/errors'
import type { FirstRunFacts } from '@/lib/first-run'

// What a student has right now, for lib/first-run.ts. Two head-only counts
// of their own rows (RLS shows no one else's). If any read fails the answer is
// "they have everything", so an error can never push anyone into the flow.
export async function readFirstRunFacts(supabase: SupabaseClient, userId: string): Promise<FirstRunFacts> {
  const [memberships, pods] = await Promise.all([
    supabase
      .from('class_memberships')
      .select('class_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'student'),
    supabase.from('pairing_members').select('pairing_id', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  const failed = memberships.error ?? pods.error
  if (failed) {
    logServerError('readFirstRunFacts', failed)
    return { studentMemberships: 1, pods: 1 }
  }
  return {
    studentMemberships: memberships.count ?? 1,
    pods: pods.count ?? 1,
  }
}
