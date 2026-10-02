// The words of a nudge notification. Lock screens are visible to others, so
// it says only who nudged (or how many nudges came overnight): never the
// memo, a class or progress numbers.
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
  },
  en: {
    title: 'Study Pods',
    one: '{name} sent you a nudge',
    oneUnknown: 'A podmate sent you a nudge',
    many: '{count} nudges arrived overnight',
  },
} as const

// `count` nudges for one recipient; `name` is the sender's display name when
// there is exactly one. An unknown locale falls back to Japanese.
export function pushText(
  locale: string,
  count: number,
  name: string | null
): { title: string; body: string } {
  const t = locale === 'en' ? PUSH_TEXT.en : PUSH_TEXT.ja
  let body: string
  if (count > 1) {
    body = t.many.replace('{count}', String(count))
  } else if (name) {
    // A replacer function, so a name containing "$&" is inserted as typed.
    body = t.one.replace('{name}', () => name)
  } else {
    body = t.oneUnknown
  }
  return { title: t.title, body }
}
