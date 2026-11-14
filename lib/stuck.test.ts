import { describe, expect, it } from 'vitest'
import { STUCK_NOTE_MAX, checkStuckNote } from './stuck'

describe('checkStuckNote', () => {
  it('trims and turns line breaks into spaces', () => {
    expect(checkStuckNote('  参考文献が\n見つかりません ')).toEqual({ ok: true, value: '参考文献が 見つかりません' })
  })
  it('needs something written', () => {
    expect(checkStuckNote(' \n ')).toEqual({ ok: false, problem: 'stuckNoteRequired' })
  })
  it('allows 80 characters and refuses 81, counting code points', () => {
    expect(checkStuckNote('あ'.repeat(STUCK_NOTE_MAX)).ok).toBe(true)
    expect(checkStuckNote('あ'.repeat(STUCK_NOTE_MAX + 1))).toEqual({ ok: false, problem: 'stuckNoteTooLong' })
    expect(checkStuckNote('😀'.repeat(STUCK_NOTE_MAX)).ok).toBe(true)
  })
})
