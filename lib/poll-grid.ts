import { addDaysYmd, tokyoToday, tokyoWeekday } from './date'
import { tokyoSlotToIso } from './meeting-poll'

// The meeting poll's week grid (item D): days across, times down, tap a cell
// to add or remove that time. Pure, so the form only keeps a set of keys.
// A key is a Tokyo date and clock: '2026-10-27T16:00'.

export const GRID_FIRST_HOUR = 8
export const GRID_LAST_HOUR = 21 // the last row starts at 21:00 (or 21:30)
export const GRID_MAX_WEEKS_AHEAD = 12

export const slotKey = (date: string, time: string) => `${date}T${time}`

export function splitSlotKey(key: string): { date: string; time: string } {
  const [date, time = ''] = key.split('T')
  return { date, time }
}

// The Monday of the Tokyo week containing `ymd`.
export function mondayOf(ymd: string): string {
  return addDaysYmd(ymd, -tokyoWeekday(ymd))
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i))
}

// The grid's rows: every hour, or every half hour.
export function gridTimes(stepMinutes: 30 | 60): string[] {
  const times: string[] = []
  for (let h = GRID_FIRST_HOUR; h <= GRID_LAST_HOUR; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return times
}

export function isPastSlot(key: string, now: Date): boolean {
  const { date, time } = splitSlotKey(key)
  const iso = tokyoSlotToIso(date, time)
  return iso === null || new Date(iso) <= now
}

// Weeks the grid may show: this week up to GRID_MAX_WEEKS_AHEAD ahead.
export function weekBounds(now: Date): { first: string; last: string } {
  const first = mondayOf(tokyoToday(now))
  return { first, last: addDaysYmd(first, 7 * GRID_MAX_WEEKS_AHEAD) }
}

// Selected keys in time order (keys sort as text because both parts are fixed width).
export function sortedKeys(keys: Iterable<string>): string[] {
  return [...keys].sort()
}
