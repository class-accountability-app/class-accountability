import { describe, expect, it } from 'vitest'
import { availability, bestOption, checkSlots, pollSummary, rankOptions, isPollAnswer, tallyOptions, tokyoSlotToIso, type PollOption, type PollVote } from './meeting-poll'

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

describe('who can make each time', () => {
  const members = ['a', 'b', 'c']
  const v = (optionId: string, userId: string, answer: PollVote['answer']): PollVote => ({ optionId, userId, answer })
  const votes = [
    v('wed1230', 'a', 'yes'), v('wed1230', 'b', 'no'),
    v('wed1800', 'a', 'yes'), v('wed1800', 'b', 'yes'), v('wed1800', 'c', 'maybe'),
    v('thu1630', 'a', 'yes'), v('thu1630', 'b', 'yes'), v('thu1630', 'c', 'yes'),
    v('thu1630', 'gone', 'no'), // someone who left the team doesn't count
  ]

  it('names who said what, in member order, and who has not answered', () => {
    const [wed1230, , thu] = availability(options, votes, members)
    expect(wed1230).toMatchObject({ yes: ['a'], maybe: [], no: ['b'], unanswered: ['c'], everyone: false })
    expect(thu).toMatchObject({ yes: ['a', 'b', 'c'], no: [], unanswered: [], everyone: true })
  })

  it('ranks by yes, then maybe, then fewest no, then the earliest', () => {
    expect(rankOptions(availability(options, votes, members)).map((o) => o.optionId)).toEqual(['thu1630', 'wed1800', 'wed1230'])
    const tie = [v('wed1230', 'a', 'yes'), v('wed1800', 'a', 'yes'), v('wed1800', 'b', 'no')]
    expect(rankOptions(availability(options, tie, members)).map((o) => o.optionId)).toEqual(['wed1230', 'wed1800', 'thu1630'])
  })

  it('opens with a time everyone can make, the earliest one', () => {
    expect(pollSummary(availability(options, votes, members))).toEqual({ kind: 'everyone', optionId: 'thu1630', more: 0 })
    const both = [...votes, v('wed1800', 'c', 'yes')].filter((x) => !(x.optionId === 'wed1800' && x.userId === 'c' && x.answer === 'maybe'))
    expect(pollSummary(availability(options, both, members))).toEqual({ kind: 'everyone', optionId: 'wed1800', more: 1 })
  })

  it('otherwise gives the best time and who it leaves out', () => {
    const some = votes.filter((x) => x.optionId !== 'thu1630')
    expect(pollSummary(availability(options, some, members))).toEqual({
      kind: 'best', optionId: 'wed1800', yes: 2, cannot: [], unanswered: [],
    })
    expect(pollSummary(availability(options, [v('wed1230', 'a', 'yes'), v('wed1230', 'b', 'no')], members))).toEqual({
      kind: 'best', optionId: 'wed1230', yes: 1, cannot: ['b'], unanswered: ['c'],
    })
  })

  it('says nothing while nobody can make any time, and with no members', () => {
    expect(pollSummary(availability(options, [v('wed1230', 'a', 'no')], members))).toEqual({ kind: 'none' })
    expect(availability(options, [], [])[0].everyone).toBe(false)
  })
})
