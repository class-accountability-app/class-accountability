import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'
import { icsFile } from '@/lib/calendar'

// A confirmed meeting as an .ics file (Apple Calendar, Outlook). RLS decides:
// only the team's members can read the poll, everyone else gets a 404.
export async function GET(_req: Request, { params }: { params: Promise<{ classId: string; pollId: string }> }) {
  const { classId, pollId } = await params
  const supabase = await createClient()
  const { data: poll } = await supabase
    .from('meeting_polls')
    .select('id, title, duration_minutes, status, meeting_poll_options!meeting_polls_chosen_option_fk(starts_at)')
    .eq('id', pollId)
    .maybeSingle()
  const chosen = poll?.meeting_poll_options as unknown as { starts_at: string } | null
  if (!poll || poll.status !== 'confirmed' || !chosen) return new NextResponse(null, { status: 404 })

  const url = `${await appOrigin()}/classes/${classId}/project/meetings/${poll.id}`
  const body = icsFile(
    { kind: 'meeting', title: poll.title, start: new Date(chosen.starts_at), minutes: poll.duration_minutes, url },
    poll.id
  )
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="study-pods-meeting.ics"',
      'Cache-Control': 'private, no-store',
    },
  })
}
