import { describe, expect, it } from 'vitest'
import {
  autosave,
  hasUnsaved,
  initialAutosave,
  retryDelay,
  type AutosaveEvent,
  type AutosaveState,
  type Theirs,
} from './autosave'

const T1 = '2026-10-02T05:05:00.000Z'
const theirs: Theirs = {
  version: 7,
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  charCount: 0,
  updatedAt: T1,
}

function run(events: AutosaveEvent[], from: AutosaveState = initialAutosave(3, null)) {
  return events.reduce(autosave, from)
}

describe('autosave', () => {
  it('starts saved on the server version', () => {
    expect(initialAutosave(3, T1)).toMatchObject({ status: 'saved', version: 3, request: 0, savedAt: T1 })
  })

  it('typing makes it dirty; a pause sends one save; OK makes it saved on the new version', () => {
    let s = run([{ type: 'EDIT' }, { type: 'EDIT' }])
    expect(s).toMatchObject({ status: 'dirty', request: 0 })
    s = autosave(s, { type: 'QUIET' })
    expect(s).toMatchObject({ status: 'saving', request: 1, keepCurrent: null })
    s = autosave(s, { type: 'SAVE_OK', version: 4, savedAt: T1 })
    expect(s).toMatchObject({ status: 'saved', version: 4, savedAt: T1, request: 1 })
  })

  it.each(['QUIET', 'MAX', 'FLUSH'] as const)('%s sends a dirty document', (type) => {
    expect(run([{ type: 'EDIT' }, { type }])).toMatchObject({ status: 'saving', request: 1 })
  })

  it.each(['QUIET', 'MAX', 'FLUSH'] as const)('%s does nothing when saved', (type) => {
    expect(run([{ type }])).toMatchObject({ status: 'saved', request: 0 })
  })

  it('a second trigger during a save sends nothing more', () => {
    const s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'MAX' }, { type: 'FLUSH' }])
    expect(s).toMatchObject({ status: 'saving', request: 1 })
  })

  it('typing during a save sends again from the new version when it lands', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'EDIT' }])
    expect(s.status).toBe('savingDirty')
    s = autosave(s, { type: 'SAVE_OK', version: 4, savedAt: T1 })
    expect(s).toMatchObject({ status: 'saving', version: 4, request: 2, keepCurrent: null })
    s = autosave(s, { type: 'SAVE_OK', version: 5, savedAt: T1 })
    expect(s).toMatchObject({ status: 'saved', version: 5 })
  })

  it('a failed save retries with backoff, and typing meanwhile stays in retrying', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_FAIL' }])
    expect(s).toMatchObject({ status: 'retrying', attempt: 1, request: 1 })
    s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'MAX' }], s)
    expect(s).toMatchObject({ status: 'retrying', request: 1 })
    s = autosave(s, { type: 'RETRY' })
    expect(s).toMatchObject({ status: 'saving', request: 2 })
    s = autosave(s, { type: 'SAVE_FAIL' })
    expect(s).toMatchObject({ status: 'retrying', attempt: 2 })
    s = autosave(s, { type: 'RETRY' })
    s = autosave(s, { type: 'SAVE_OK', version: 4, savedAt: T1 })
    expect(s).toMatchObject({ status: 'saved', attempt: 0, version: 4 })
  })

  it('offline, then back online: ONLINE retries at once', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_FAIL' }, { type: 'EDIT' }])
    expect(s.status).toBe('retrying')
    s = autosave(s, { type: 'ONLINE' })
    expect(s).toMatchObject({ status: 'saving', request: 2 })
  })

  it('今すぐ保存 (FLUSH) retries at once', () => {
    const s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_FAIL' }, { type: 'FLUSH' }])
    expect(s).toMatchObject({ status: 'saving', request: 2 })
  })

  it('RETRY and ONLINE do nothing unless retrying', () => {
    expect(run([{ type: 'ONLINE' }])).toMatchObject({ status: 'saved', request: 0 })
    expect(run([{ type: 'EDIT' }, { type: 'RETRY' }])).toMatchObject({ status: 'dirty', request: 0 })
  })

  it('the backoff is 2, 4, 8, 16 s, then 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000])
  })

  it('a conflict stops autosave until the student chooses', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_CONFLICT', theirs }])
    expect(s).toMatchObject({ status: 'conflict', theirs, request: 1 })
    s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'MAX' }, { type: 'FLUSH' }, { type: 'ONLINE' }, { type: 'RETRY' }], s)
    expect(s).toMatchObject({ status: 'conflict', request: 1 })
  })

  it('a conflict while typing during the save', () => {
    const s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'EDIT' }, { type: 'SAVE_CONFLICT', theirs }])
    expect(s).toMatchObject({ status: 'conflict', theirs })
  })

  it('a conflict during a retry', () => {
    const s = run([
      { type: 'EDIT' },
      { type: 'QUIET' },
      { type: 'SAVE_FAIL' },
      { type: 'RETRY' },
      { type: 'SAVE_CONFLICT', theirs },
    ])
    expect(s).toMatchObject({ status: 'conflict', theirs, attempt: 0 })
  })

  it('CHOOSE_MINE saves mine over their version, keeping theirs as a version first', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_CONFLICT', theirs }, { type: 'CHOOSE_MINE' }])
    expect(s).toMatchObject({ status: 'saving', version: 7, keepCurrent: 'conflict', request: 2, theirs: null })
    s = autosave(s, { type: 'SAVE_OK', version: 8, savedAt: T1 })
    expect(s).toMatchObject({ status: 'saved', version: 8, keepCurrent: null })
  })

  it('CHOOSE_MINE keeps keepCurrent through a failed save and its retry', () => {
    let s = run([
      { type: 'EDIT' },
      { type: 'QUIET' },
      { type: 'SAVE_CONFLICT', theirs },
      { type: 'CHOOSE_MINE' },
      { type: 'SAVE_FAIL' },
    ])
    expect(s).toMatchObject({ status: 'retrying', keepCurrent: 'conflict' })
    s = autosave(s, { type: 'RETRY' })
    expect(s).toMatchObject({ status: 'saving', keepCurrent: 'conflict', request: 3 })
  })

  it('CHOOSE_MINE then typing: the second save no longer keeps theirs', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_CONFLICT', theirs }, { type: 'CHOOSE_MINE' }, { type: 'EDIT' }])
    s = autosave(s, { type: 'SAVE_OK', version: 8, savedAt: T1 })
    expect(s).toMatchObject({ status: 'saving', version: 8, keepCurrent: null })
  })

  it('THEIRS_LOADED takes their version (mine was kept as a version)', () => {
    const s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_CONFLICT', theirs }, { type: 'THEIRS_LOADED', version: 7, savedAt: T1 }])
    expect(s).toMatchObject({ status: 'saved', version: 7, theirs: null })
  })

  it('CHOOSE_MINE and THEIRS_LOADED do nothing without a conflict', () => {
    expect(run([{ type: 'EDIT' }, { type: 'CHOOSE_MINE' }])).toMatchObject({ status: 'dirty', request: 0 })
    expect(run([{ type: 'THEIRS_LOADED', version: 9, savedAt: T1 }])).toMatchObject({ status: 'saved', version: 3 })
  })

  describe('IME composition', () => {
    it('holds a save while composing and sends it at compositionend', () => {
      let s = run([{ type: 'COMPOSITION_START' }, { type: 'EDIT' }, { type: 'QUIET' }, { type: 'MAX' }])
      expect(s).toMatchObject({ status: 'dirty', held: true, request: 0 })
      s = autosave(s, { type: 'COMPOSITION_END' })
      expect(s).toMatchObject({ status: 'saving', held: false, composing: false, request: 1 })
    })

    it('holds a retry too', () => {
      let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_FAIL' }, { type: 'COMPOSITION_START' }, { type: 'ONLINE' }])
      expect(s).toMatchObject({ status: 'retrying', held: true, request: 1 })
      s = autosave(s, { type: 'COMPOSITION_END' })
      expect(s).toMatchObject({ status: 'saving', request: 2 })
    })

    it('compositionend without a held save sends nothing (the quiet timer will)', () => {
      const s = run([{ type: 'COMPOSITION_START' }, { type: 'EDIT' }, { type: 'COMPOSITION_END' }])
      expect(s).toMatchObject({ status: 'dirty', request: 0, composing: false })
    })

    it('a save already on its way lands; the resend waits for the word', () => {
      const s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'COMPOSITION_START' }, { type: 'EDIT' }, { type: 'SAVE_OK', version: 4, savedAt: T1 }])
      // The resend after typing during a save waits for compositionend too.
      expect(s).toMatchObject({ status: 'dirty', version: 4, held: true, request: 1 })
      expect(autosave(s, { type: 'COMPOSITION_END' })).toMatchObject({ status: 'saving', request: 2 })
    })
  })

  it('a refused save blocks autosave until the text changes', () => {
    let s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'SAVE_REJECTED', reason: 'documentTooLong' }])
    expect(s).toMatchObject({ status: 'dirty', blocked: 'documentTooLong', request: 1 })
    s = run([{ type: 'QUIET' }, { type: 'MAX' }, { type: 'FLUSH' }], s)
    expect(s).toMatchObject({ status: 'dirty', request: 1 })
    s = run([{ type: 'EDIT' }, { type: 'QUIET' }], s)
    expect(s).toMatchObject({ status: 'saving', blocked: null, request: 2 })
  })

  it('typing during a refused save: still blocked until the next edit', () => {
    const s = run([{ type: 'EDIT' }, { type: 'QUIET' }, { type: 'EDIT' }, { type: 'SAVE_REJECTED', reason: 'documentInvalid' }, { type: 'QUIET' }])
    expect(s).toMatchObject({ status: 'dirty', blocked: 'documentInvalid', request: 1 })
  })

  it('OPEN_CONFLICT (a draft typed on an older version) waits for the choice', () => {
    let s = run([{ type: 'OPEN_CONFLICT', theirs }])
    expect(s).toMatchObject({ status: 'conflict', theirs, request: 0 })
    s = autosave(s, { type: 'CHOOSE_MINE' })
    expect(s).toMatchObject({ status: 'saving', version: 7, keepCurrent: 'conflict', request: 1 })
    expect(run([{ type: 'EDIT' }, { type: 'OPEN_CONFLICT', theirs }]).status).toBe('dirty')
  })

  it('LOADED (after a restore) starts over on the new version', () => {
    const s = run([{ type: 'EDIT' }, { type: 'LOADED', version: 12, savedAt: T1 }])
    expect(s).toMatchObject({ status: 'saved', version: 12, savedAt: T1, request: 0 })
  })

  it('hasUnsaved is true for everything but saved', () => {
    expect(['saved', 'dirty', 'saving', 'savingDirty', 'retrying', 'conflict'].map((s) => hasUnsaved(s as never))).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
    ])
  })
})
