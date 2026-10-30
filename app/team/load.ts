import type { createClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'
import { groupedCode, shortJoinUrl } from '@/lib/join-link'
import { qrSvg } from '@/lib/qr'
import { teamJoinUrl } from '@/lib/team-code'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type TeamInvite = { url: string; shortUrl: string; code: string; grouped: string; svg: string }

// My pod's join code and QR (0028). RLS shows the code to the pod's members
// only. Null if there is none (or the table isn't there yet), so the card hides.
export async function loadTeamInvite(supabase: Supabase, podId: string): Promise<TeamInvite | null> {
  const { data, error } = await supabase.from('pod_join_codes').select('code').eq('pod_id', podId).maybeSingle()
  if (error || !data) return null
  const url = teamJoinUrl(await appOrigin(), data.code)
  return { url, shortUrl: shortJoinUrl(url), code: data.code, grouped: groupedCode(data.code), svg: await qrSvg(url) }
}
