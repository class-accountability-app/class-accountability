// 「困っています」 on a task (0047): the owner's one-line note. The database
// checks the same things (1–80 characters after trimming, no control
// characters); checking here first gives the student a plain message.
export const STUCK_NOTE_MAX = 80

export type StuckProblem = 'stuckNoteRequired' | 'stuckNoteTooLong'

export function checkStuckNote(raw: string): { ok: true; value: string } | { ok: false; problem: StuckProblem } {
  // Line breaks and tabs become spaces: it is one line on the board.
  const value = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  if (value === '') return { ok: false, problem: 'stuckNoteRequired' }
  // Code points, as Postgres' char_length counts them.
  if ([...value].length > STUCK_NOTE_MAX) return { ok: false, problem: 'stuckNoteTooLong' }
  return { ok: true, value }
}
