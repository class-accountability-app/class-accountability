import { describe, expect, it } from 'vitest'
import { bestOption, checkSlots, isPollAnswer, tallyOptions, tokyoSlotToIso, type PollOption, type PollVote } from './meeting-poll'

const options: PollOption[] = [
  { id: 'wed1230', startsAt: '2026-10-07T03:30:00.000Z' },
  { id: 'wed1800', startsAt: '2026-10-07T09:00:00.000Z' },
  { id: 'thu1630', startsAt: '2026-10-08T07:30:00.000Z' },
]
const members = ['aki', 'sato', 'tanaka']

describe('tallyOptions', () => {
  it('counts answers per time and who hasn’t answered, ignoring ex-members', () => {
    const votes: PollVote[] = [
      { optionId: 'wed1230', userId: 'aki', answer: 'yes' },
      { optionId: 'wed1230', userId: 'sato', answer: 'maybe' },
      { optionId: 'wed1800', userId: 'aki', answer: 'no' },
      { optionId: 'thu1630', userId: 'left', answer: 'yes' },
    ]
    expect(tallyOptions(options, votes, members)).toEqual([
      { optionId: 'wed1230', yes: 1, maybe: 1, no: 0, unanswered: 1 },
      { optionId: 'wed1800', yes: 0, maybe: 0, no: 1, unanswered: 2 },
      { optionId: 'thu1630', yes: 0, maybe: 0, no: 0, unanswered: 3 },
    ])
  })
})

describe('bestOption', () => {
  const tally = (votes: PollVote[]) => tallyOptions(options, votes, members)

  it('picks the most yes', () => {
    const votes: PollVote[] = [
      { optionId: 'wed1230', userId: 'aki', answer: 'yes' },
      { optionId: 'thu1630', userId: 'aki', answer: 'yes' },
      { optionId: 'thu1630', userId: 'sato', answer: 'yes' },
    ]
    expect(bestOption(options, tally(votes))).toBe('thu1630')
  })

  it('breaks a yes tie by maybe, then by the earlier time', () => {
    const byMaybe: PollVote[] = [
      { optionId: 'wed1230', userId: 'aki', answer: 'yes' },
      { optionId: 'wed1800', userId: 'aki', answer: 'yes' },
      { optionId: 'wed1800', userId: 'sato', answer: 'maybe' },
    ]
    expect(bestOption(options, tally(byMaybe))).toBe('wed1800')
    const byTime: PollVote[] = [
      { optionId: 'thu1630', userId: 'aki', answer: 'yes' },
      { optionId: 'wed1800', userId: 'sato', answer: 'yes' },
    ]
    expect(bestOption(options, tally(byTime))).toBe('wed1800')
  })

  it('is null while nobody can make any time', () => {
    expect(bestOption(options, tally([]))).toBeNull()
    expect(bestOption(options, tally([{ optionId: 'wed1230', userId: 'aki', answer: 'no' }]))).toBeNull()
  })
})

describe('tokyoSlotToIso', () => {
  it('reads a Tokyo date and time', () => {
    expect(tokyoSlotToIso('2026-10-08', '16:30')).toBe('2026-10-08T07:30:00.000Z')
    expect(tokyoSlotToIso('2026-10-08', '00:15')).toBe('2026-10-07T15:15:00.000Z')
  })

  it('refuses malformed or impossible values', () => {
    expect(tokyoSlotToIso('2026-02-31', '10:00')).toBeNull()
    expect(tokyoSlotToIso('2026-10-08', '25:00')).toBeNull()
    expect(tokyoSlotToIso('', '10:00')).toBeNull()
    expect(tokyoSlotToIso('2026-10-08', '9:00')).toBeNull()
  })
})

describe('checkSlots', () => {
  const now = new Date('2026-10-05T00:00:00Z')

  it('returns the filled times sorted, skipping empty rows', () => {
    expect(
      checkSlots(
        [
          { date: '2026-10-08', time: '16:30' },
          { date: '', time: '' },
          { date: '2026-10-07', time: '12:30' },
        ],
        now
      )
    ).toEqual({ ok: true, value: ['2026-10-07T03:30:00.000Z', '2026-10-08T07:30:00.000Z'] })
  })

  it('reports the first problem', () => {
    const at = (date: string, time = '10:00') => ({ date, time })
    expect(checkSlots([at('2026-10-08')], now)).toEqual({ ok: false, problem: 'tooFew' })
    expect(checkSlots(Array.from({ length: 20 }, (_, i) => at(`2026-10-${10 + i}`)), now).ok).toBe(true)
    expect(checkSlots(Array.from({ length: 21 }, (_, i) => at(`2026-10-${10 + i}`)), now)).toEqual({ ok: false, problem: 'tooMany' })
    expect(checkSlots([at('2026-10-08'), at('2026-10-09', '')], now)).toEqual({ ok: false, problem: 'invalid' })
    expect(checkSlots([at('2026-10-08'), at('2026-10-01')], now)).toEqual({ ok: false, problem: 'past' })
    expect(checkSlots([at('2026-10-08'), at('2026-10-08')], now)).toEqual({ ok: false, problem: 'duplicate' })
  })
})

describe('isPollAnswer', () => {
  it('accepts only yes, maybe and no', () => {
    expect(['yes', 'maybe', 'no'].every(isPollAnswer)).toBe(true)
    expect(isPollAnswer('sure')).toBe(false)
  })
})
