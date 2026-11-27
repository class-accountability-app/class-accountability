import type { createClient } from '@/lib/supabase/server'
import { TEAM_SIZE_DEFAULT, teamLimitOf } from '@/lib/team-size'

type Supabase = Awaited<ReturnType<typeof createClient>>

// The class's team size limit (0053). Read on its own, so a page still loads
// before the migration adds the column: then `stored` is false and the limit
// is the old cap of 6 (the organizer's setting is hidden until it exists).
// Class members (students and the organizer) can read their class row.
export async function loadTeamLimitInfo(
  supabase: Supabase,
  classId: string
): Promise<{ limit: number; stored: boolean }> {
  const { data, error } = await supabase
    .from('classes')
    .select('team_size_limit')
    .eq('id', classId)
    .maybeSingle<{ team_size_limit: number }>()
  if (error || !data) return { limit: TEAM_SIZE_DEFAULT, stored: false }
  return { limit: teamLimitOf(data.team_size_limit), stored: true }
}

export async function loadTeamLimit(supabase: Supabase, classId: string): Promise<number> {
  return (await loadTeamLimitInfo(supabase, classId)).limit
}
