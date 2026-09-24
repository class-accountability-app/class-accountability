import type { Locale } from '@/i18n/config'

// Every date shown to a user goes through this module. "Today", "yesterday"
// and day counts are Tokyo calendar days, never the server's UTC.
export const APP_TIME_ZONE = 'Asia/Tokyo'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

type DateInput = string | Date

// A bare 'YYYY-MM-DD' (e.g. a deadline column) is a Tokyo calendar date,
// not UTC midnight.
function toDate(value: DateInput): Date {
  if (value instanceof Date) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+09:00`)
  return new Date(value)
}

const tokyoYmd = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

function tokyoDayNumber(date: Date): number {
  const parts = tokyoYmd.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS
}

// Whole Tokyo calendar days between `value` and `now` (0 = same day).
export function tokyoDaysAgo(value: DateInput, now: Date = new Date()): number {
  return tokyoDayNumber(now) - tokyoDayNumber(toDate(value))
}

// ICU puts a space in Japanese relative times ("8 日前"); Japanese text sets
// the number flush against the unit ("8日前").
function tidy(text: string, locale: Locale): string {
  if (locale === 'ja') return text.replace(/(\d)\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '$1')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function relative(locale: Locale, amount: number, unit: Intl.RelativeTimeFormatUnit): string {
  return tidy(new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-amount, unit), locale)
}

// 1月20日 / Jan 20
export function formatDate(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    month: locale === 'ja' ? 'long' : 'short',
    day: 'numeric',
  }).format(toDate(value))
}

function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

// 今日 / Today, 昨日 / Yesterday, 8日前 / 8 days ago
export function formatDayAgo(value: DateInput, locale: Locale, now: Date = new Date()): string {
  return relative(locale, Math.max(0, tokyoDaysAgo(value, now)), 'day')
}

// Finer-grained for recent events: 今 / Now, 5分前 / 5 minutes ago,
// 3時間前 / 3 hours ago (same Tokyo day), then falls back to day labels.
export function formatTimeAgo(value: DateInput, locale: Locale, now: Date = new Date()): string {
  const date = toDate(value)
  const diffMs = Math.max(0, now.getTime() - date.getTime())
  if (diffMs < MINUTE_MS) return relative(locale, 0, 'second')
  if (diffMs < HOUR_MS) return relative(locale, Math.floor(diffMs / MINUTE_MS), 'minute')
  if (tokyoDaysAgo(date, now) === 0) return relative(locale, Math.floor(diffMs / HOUR_MS), 'hour')
  return formatDayAgo(date, locale, now)
}

// 今日 21:40 / Today 9:40 PM for today and yesterday, otherwise
// 1月2日 22:10 / Jan 2, 10:10 PM.
export function formatDateTime(value: DateInput, locale: Locale, now: Date = new Date()): string {
  const date = toDate(value)
  const time = formatTime(date, locale)
  const days = tokyoDaysAgo(date, now)
  if (days === 0 || days === 1) {
    return `${formatDayAgo(date, locale, now)} ${time}`
  }
  return locale === 'ja' ? `${formatDate(date, locale)} ${time}` : `${formatDate(date, locale)}, ${time}`
}
