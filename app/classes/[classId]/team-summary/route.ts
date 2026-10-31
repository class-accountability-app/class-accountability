import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { toCsv } from '@/lib/csv'
import { tokyoToday } from '@/lib/date'

// The organizer's team summary as CSV (feature batch 1). class_team_summary()
// returns rows only to this class's organizer (0027), so anyone else gets an
// empty file; no names or per-person numbers are in it.
export async function GET(_req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const supabase = await createClient()
  const [{ data, error }, t] = await Promise.all([
    supabase.rpc('class_team_summary', { p_class: classId }),
    getTranslations('teacher.csv'),
  ])
  if (error) return new NextResponse(null, { status: 404 })
  type Row = {
    team_no: number
    members: number
    has_project: boolean
    start_date: string | null
    deadline: string | null
    task_count: number
    percent: number
    last_activity: string | null
    checkins_this_round: number
  }
  const rows = ((data as Row[] | null) ?? []).map((r) => [
    r.team_no,
    r.members,
    r.has_project ? t('yes') : t('no'),
    r.start_date,
    r.deadline,
    r.task_count,
    r.percent,
    // The Tokyo day of the last activity (CLAUDE.md rule 9).
    r.last_activity ? tokyoToday(new Date(r.last_activity)) : null,
    r.checkins_this_round,
  ])
  const header = (['team', 'members', 'hasProject', 'start', 'deadline', 'tasks', 'percent', 'lastActivity', 'checkins'] as const).map((k) => t(k))
  return new NextResponse(toCsv([header, ...rows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="team-summary.csv"',
      'Cache-Control': 'private, no-store',
    },
  })
}
