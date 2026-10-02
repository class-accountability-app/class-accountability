import { describe, expect, it } from 'vitest'
import { DRAFT_MAX_AGE_MS, decideDraft, draftKey, type LocalDraft } from './local-draft'

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const NOW = Date.UTC(2026, 9, 2, 6, 0)
const ME = 'user-a'

function draft(over: Partial<LocalDraft> = {}): LocalDraft {
  return { userId: ME, targetId: 't1', content: doc('mine'), baseVersion: 4, rev: 9, editedAt: NOW - 60_000, ...over }
}

describe('decideDraft', () => {
  const server = { userId: ME, version: 4, content: doc('server') }

  it('no draft: nothing to do', () => {
    expect(decideDraft(null, server, NOW)).toEqual({ kind: 'none', discard: false })
  })

  it('unsaved text on the current version is offered back', () => {
    const d = draft()
    expect(decideDraft(d, server, NOW)).toEqual({ kind: 'offer', draft: d })
  })

  it('the server moved on since the draft: the conflict choice', () => {
    const d = draft({ baseVersion: 2 })
    expect(decideDraft(d, server, NOW)).toEqual({ kind: 'conflict', draft: d })
  })

  it('the same text as the server: deleted quietly', () => {
    expect(decideDraft(draft({ content: doc('server') }), server, NOW)).toEqual({ kind: 'none', discard: true })
    expect(decideDraft(draft({ content: doc('server'), baseVersion: 1 }), server, NOW)).toEqual({ kind: 'none', discard: true })
  })

  it('another student’s draft is wiped, never shown', () => {
    expect(decideDraft(draft({ userId: 'user-b' }), server, NOW)).toEqual({ kind: 'none', discard: true })
  })

  it('a draft older than 7 days is dropped', () => {
    expect(decideDraft(draft({ editedAt: NOW - DRAFT_MAX_AGE_MS - 1 }), server, NOW)).toEqual({ kind: 'none', discard: true })
    expect(decideDraft(draft({ editedAt: NOW - DRAFT_MAX_AGE_MS + 1000 }), server, NOW).kind).toBe('offer')
  })

  it('a base version newer than the server’s is dropped', () => {
    expect(decideDraft(draft({ baseVersion: 5 }), server, NOW)).toEqual({ kind: 'none', discard: true })
  })

  it('keys are per student and target', () => {
    expect(draftKey('u', 't')).toBe('u:t')
  })
})
