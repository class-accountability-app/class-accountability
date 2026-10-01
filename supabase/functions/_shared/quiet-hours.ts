// Quiet hours for nudge pushes: 23:00–07:00 in Tokyo. A nudge sent then is
// held and sent at 07:00 (0018's pg_cron job). Used by the send-nudge-push
// Edge Function, which can't import lib/date.ts, so this one Tokyo-time
// helper lives here; it follows lib/date.ts (Intl with Asia/Tokyo).

export const QUIET_FROM_HOUR = 23
export const QUIET_UNTIL_HOUR = 7

const tokyoHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  hour: 'numeric',
  hourCycle: 'h23',
})

export function isQuietHours(now: Date): boolean {
  const hour = Number(tokyoHour.formatToParts(now).find((part) => part.type === 'hour')?.value)
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR
}
