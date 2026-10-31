import { describe, expect, it } from 'vitest'
import { googleCalendarUrl, icsFile } from './calendar'

const meeting = {
  kind: 'meeting' as const,
  title: '中間チェック, 1',
  start: new Date('2026-11-05T07:30:00Z'),
  minutes: 45,
  url: 'https://study-pods.org/x',
}

describe('calendar', () => {
  it('builds a Google Calendar link with UTC times', () => {
    const url = new URL(googleCalendarUrl(meeting))
    expect(url.searchParams.get('dates')).toBe('20261105T073000Z/20261105T081500Z')
    expect(url.searchParams.get('text')).toBe('中間チェック, 1')
  })

  it('makes an all-day event for a due date', () => {
    const url = new URL(googleCalendarUrl({ kind: 'due', title: 'Slides', date: '2026-11-30', url: 'u' }))
    expect(url.searchParams.get('dates')).toBe('20261130/20261201')
  })

  it('escapes semicolons, commas and backslashes in the title', () => {
    const ics = icsFile({ ...meeting, title: 'a;b,c\\d' }, 'x', new Date('2026-11-01T00:00:00Z'))
    expect(ics).toContain('SUMMARY:a\\;b\\,c\\\\d\r\n')
  })

  it('writes a valid, escaped .ics', () => {
    const ics = icsFile(meeting, 'abc', new Date('2026-11-01T00:00:00Z'))
    expect(ics).toContain('DTSTART:20261105T073000Z\r\n')
    expect(ics).toContain('DTEND:20261105T081500Z\r\n')
    expect(ics).toContain('SUMMARY:中間チェック\\, 1\r\n')
    expect(ics).toContain('UID:abc@study-pods.org')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })
})
