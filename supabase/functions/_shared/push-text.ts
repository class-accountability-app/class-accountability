// The words of a push notification. Lock screens are visible to others, so a
// nudge says only who nudged (or how many nudges came overnight), never the
// memo, a class or progress numbers. A meeting reminder says when, not what;
// a stalled-task push names the task (it goes to its owner only) but never a
// number.
//
// The Edge Function can't read messages/*.json once deployed, so these are a
// copy of their "push" keys; push-text.test.ts fails if the two drift.

export type PushLocale = 'ja' | 'en'

export const PUSH_TEXT = {
  ja: {
    title: 'Study Pods',
    one: '{name}さんから声かけが届きました',
    oneUnknown: '仲間から声かけが届きました',
    many: '夜のあいだに声かけが{count}件届きました',
    meeting: '打ち合わせは{when}からです',
    meetingCheckin: '打ち合わせは{when}からです。その前にチェックインしましょう',
    stalled: '「{task}」が{days}日止まっています。少しだけでも進めてみませんか',
  },
  en: {
    title: 'Study Pods',
    one: '{name} sent you a nudge',
    oneUnknown: 'A podmate sent you a nudge',
    many: '{count} nudges arrived overnight',
    meeting: 'Your meeting starts {when}',
    meetingCheckin: 'Your meeting starts {when}. Check in before then',
    stalled: '“{task}” hasn’t moved for {days} days. Even a little progress helps',
  },
} as const

const textFor = (locale: string) => (locale === 'en' ? PUSH_TEXT.en : PUSH_TEXT.ja)

// A replacer function, so a value containing "$&" is inserted as typed.
const fill = (template: string, key: string, value: string) => template.replace(`{${key}}`, () => value)

// `count` nudges for one recipient; `name` is the sender's display name when
// there is exactly one. An unknown locale falls back to Japanese.
export function pushText(
  locale: string,
  count: number,
  name: string | null
): { title: string; body: string } {
  const t = textFor(locale)
  let body: string
  if (count > 1) {
    body = fill(t.many, 'count', String(count))
  } else if (name) {
    body = fill(t.one, 'name', name)
  } else {
    body = t.oneUnknown
  }
  return { title: t.title, body }
}

const meetingWhen = {
  ja: new Intl.DateTimeFormat('ja', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }),
  en: new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }),
}

// 「10月8日(木) 16:30」 / "Thu, Oct 8, 4:30 PM", always Tokyo time.
export function meetingWhenText(locale: string, startsAt: Date): string {
  return (locale === 'en' ? meetingWhen.en : meetingWhen.ja).format(startsAt)
}

export function meetingReminderText(
  locale: string,
  startsAt: Date,
  needsCheckin: boolean
): { title: string; body: string } {
  const t = textFor(locale)
  return { title: t.title, body: fill(needsCheckin ? t.meetingCheckin : t.meeting, 'when', meetingWhenText(locale, startsAt)) }
}

export function stalledTaskText(locale: string, task: string, days: number): { title: string; body: string } {
  const t = textFor(locale)
  return { title: t.title, body: fill(fill(t.stalled, 'task', task), 'days', String(days)) }
}
