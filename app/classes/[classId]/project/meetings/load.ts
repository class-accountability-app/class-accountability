import type { createClient } from '@/lib/supabase/server'
import { formatClock, formatDateWithWeekday } from '@/lib/date'
import type { Locale } from '@/i18n/config'
import type { PollAnswer, PollOption, PollVote } from '@/lib/meeting-poll'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type Poll = {
  id: string
  title: string
  durationMinutes: number
  voteBy: string | null
  status: 'open' | 'confirmed' | 'cancelled'
  chosenOptionId: string | null
  createdBy: string | null
  createdAt: string
  options: PollOption[] // earliest first
  votes: PollVote[]
}

// A project's polls with their times and answers (RLS: the pod's only).
export async function loadPolls(supabase: Supabase, projectId: string, pollId?: string): Promise<Poll[]> {
  let query = supabase
    .from('meeting_polls')
    .select('id, title, duration_minutes, vote_by, status, chosen_option_id, created_by, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (pollId) query = query.eq('id', pollId)
  const { data: polls } = await query
  if (!polls || polls.length === 0) return []

  const ids = polls.map((p) => p.id)
  const { data: options } = await supabase
    .from('meeting_poll_options')
    .select('id, poll_id, starts_at')
    .in('poll_id', ids)
    .order('starts_at')
  const optionIds = (options ?? []).map((o) => o.id)
  const { data: votes } =
    optionIds.length > 0
      ? await supabase.from('meeting_poll_votes').select('option_id, user_id, answer').in('option_id', optionIds)
      : { data: [] as { option_id: string; user_id: string; answer: PollAnswer }[] }

  return polls.map((p) => {
    const mine = (options ?? []).filter((o) => o.poll_id === p.id)
    const mineIds = new Set(mine.map((o) => o.id))
    return {
      id: p.id,
      title: p.title,
      durationMinutes: p.duration_minutes,
      voteBy: p.vote_by,
      status: p.status,
      chosenOptionId: p.chosen_option_id,
      createdBy: p.created_by,
      createdAt: p.created_at,
      options: mine.map((o) => ({ id: o.id, startsAt: new Date(o.starts_at).toISOString() })),
      votes: (votes ?? [])
        .filter((v) => mineIds.has(v.option_id))
        .map((v) => ({ optionId: v.option_id, userId: v.user_id, answer: v.answer as PollAnswer })),
    }
  })
}

export function chosenStart(poll: Poll): string | null {
  return poll.options.find((o) => o.id === poll.chosenOptionId)?.startsAt ?? null
}

// Still ahead (or under way): confirmed and not yet over.
export function isUpcoming(poll: Poll, now: Date): boolean {
  const start = chosenStart(poll)
  return poll.status === 'confirmed' && start !== null && new Date(start).getTime() + poll.durationMinutes * 60_000 > now.getTime()
}

// 10月8日（木）16:30 / Thu, Oct 8 4:30 PM
export function formatSlot(iso: string, locale: Locale): string {
  return `${formatDateWithWeekday(iso, locale)} ${formatClock(iso, locale)}`
}

// 10月8日（木）16:30–17:00
export function formatMeeting(iso: string, minutes: number, locale: Locale): string {
  const end = new Date(new Date(iso).getTime() + minutes * 60_000)
  return `${formatSlot(iso, locale)}–${formatClock(end, locale)}`
}
