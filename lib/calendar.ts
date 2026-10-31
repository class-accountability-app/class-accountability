// "Add to calendar" (feature batch 1) for a confirmed meeting or a task's due
// day: a Google Calendar link and an .ics file (Apple Calendar, Outlook).
// Pure, so it is tested. Times are UTC in both formats; due days are all-day.

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const day = (ymd: string) => ymd.replace(/-/g, '')

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export type CalendarEvent =
  | { kind: 'meeting'; title: string; start: Date; minutes: number; url: string }
  | { kind: 'due'; title: string; date: string; url: string }

function range(e: CalendarEvent): string {
  if (e.kind === 'due') return `${day(e.date)}/${day(nextDay(e.date))}`
  return `${stamp(e.start)}/${stamp(new Date(e.start.getTime() + e.minutes * 60_000))}`
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: range(e), details: e.url })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// RFC 5545 text: escape \ ; , and newlines.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function icsFile(e: CalendarEvent, uid: string, now: Date = new Date()): string {
  const when =
    e.kind === 'due'
      ? [`DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${day(nextDay(e.date))}`]
      : [`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(new Date(e.start.getTime() + e.minutes * 60_000))}`]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Study Pods//JA',
    'BEGIN:VEVENT',
    `UID:${uid}@study-pods.org`,
    `DTSTAMP:${stamp(now)}`,
    ...when,
    `SUMMARY:${esc(e.title)}`,
    `URL:${e.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
