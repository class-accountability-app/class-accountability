// Meeting polls (0024): counting answers and picking the time most people can
// make. Pure functions, like project-stats.ts.

export const POLL_ANSWERS = ['yes', 'maybe', 'no'] as const
export type PollAnswer = (typeof POLL_ANSWERS)[number]

export const POLL_DURATIONS = [30, 45, 60] as const
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 20
export const POLL_TITLE_MAX = 60
// 回答のしめきり shortcuts, in days from now (the form also takes any time).
export const VOTE_BY_DAYS = [1, 3, 7] as const

export function isPollAnswer(value: unknown): value is PollAnswer {
  return typeof value === 'string' && (POLL_ANSWERS as readonly string[]).includes(value)
}

export type PollOption = { id: string; startsAt: string } // ISO timestamp
export type PollVote = { optionId: string; userId: string; answer: PollAnswer }
export type OptionTally = { optionId: string; yes: number; maybe: number; no: number; unanswered: number }

// Per time: how many said yes / maybe / no, and how many members haven't
// answered it. Only current members count (someone who left doesn't).
export function tallyOptions(
  options: readonly PollOption[],
  votes: readonly PollVote[],
  memberIds: readonly string[],
): OptionTally[] {
  const members = new Set(memberIds)
  return options.map((o) => {
    const mine = votes.filter((v) => v.optionId === o.id && members.has(v.userId))
    const count = (a: PollAnswer) => mine.filter((v) => v.answer === a).length
    return { optionId: o.id, yes: count('yes'), maybe: count('maybe'), no: count('no'), unanswered: members.size - mine.length }
  })
}

// The time most people can make: most yes, then most maybe, then the
// earliest. Null while nobody has said yes or maybe to anything.
export function bestOption(options: readonly PollOption[], tallies: readonly OptionTally[]): string | null {
  const byId = new Map(tallies.map((t) => [t.optionId, t]))
  let best: { id: string; yes: number; maybe: number; startsAt: string } | null = null
  for (const o of options) {
    const t = byId.get(o.id)
    if (!t || t.yes + t.maybe === 0) continue
    if (
      !best ||
      t.yes > best.yes ||
      (t.yes === best.yes && t.maybe > best.maybe) ||
      (t.yes === best.yes && t.maybe === best.maybe && o.startsAt < best.startsAt)
    ) {
      best = { id: o.id, yes: t.yes, maybe: t.maybe, startsAt: o.startsAt }
    }
  }
  return best?.id ?? null
}

// A time typed as a Tokyo date and clock ('2026-10-08', '16:30') as an ISO
// timestamp, or null if either part isn't a real value.
export function tokyoSlotToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const at = new Date(`${date}T${time}:00+09:00`)
  if (Number.isNaN(at.getTime())) return null
  // Reject rollovers such as 2026-02-31 (Date would quietly make it March 3).
  const back = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
  return back === date ? at.toISOString() : null
}

export type SlotProblem = 'tooFew' | 'tooMany' | 'invalid' | 'past' | 'duplicate'

// The suggested times as ISO timestamps, sorted, or the first problem. The
// database checks the same rules (SP013); this gives a clear message first.
export function checkSlots(
  slots: readonly { date: string; time: string }[],
  now: Date,
): { ok: true; value: string[] } | { ok: false; problem: SlotProblem } {
  const filled = slots.filter((s) => s.date !== '' || s.time !== '')
  if (filled.length < POLL_MIN_OPTIONS) return { ok: false, problem: 'tooFew' }
  if (filled.length > POLL_MAX_OPTIONS) return { ok: false, problem: 'tooMany' }
  const isos: string[] = []
  for (const s of filled) {
    const iso = tokyoSlotToIso(s.date, s.time)
    if (iso === null) return { ok: false, problem: 'invalid' }
    if (new Date(iso) <= now) return { ok: false, problem: 'past' }
    isos.push(iso)
  }
  if (new Set(isos).size !== isos.length) return { ok: false, problem: 'duplicate' }
  return { ok: true, value: isos.sort() }
}
