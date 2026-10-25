import { describe, expect, it } from 'vitest'
import ja from '@/messages/ja.json'
import en from '@/messages/en.json'
import { PUSH_TEXT, meetingReminderText, pushText, stalledTaskText } from './push-text'

describe('pushText', () => {
  it('names the sender in Japanese', () => {
    expect(pushText('ja', 1, '佐藤')).toEqual({
      title: 'Study Pods',
      body: '佐藤さんから声かけが届きました',
    })
  })

  it('names the sender in English', () => {
    expect(pushText('en', 1, 'Aki')).toEqual({ title: 'Study Pods', body: 'Aki sent you a nudge' })
  })

  it('summarises the overnight nudges in both languages', () => {
    expect(pushText('ja', 3, null).body).toBe('夜のあいだに声かけが3件届きました')
    expect(pushText('en', 3, null).body).toBe('3 nudges arrived overnight')
  })

  it('falls back when the name is missing', () => {
    expect(pushText('ja', 1, null).body).toBe('仲間から声かけが届きました')
    expect(pushText('en', 1, null).body).toBe('A podmate sent you a nudge')
  })

  it('treats an unknown locale as Japanese', () => {
    expect(pushText('fr', 1, 'Aki').body).toBe('Akiさんから声かけが届きました')
  })

  it('inserts a name literally, even with $ patterns', () => {
    expect(pushText('en', 1, '$&$1').body).toBe('$&$1 sent you a nudge')
  })

  it('says when a meeting starts, in Tokyo time', () => {
    const at = new Date('2026-10-08T07:30:00Z') // 16:30 JST
    expect(meetingReminderText('ja', at, false).body).toBe('打ち合わせは10月8日(木) 16:30からです')
    expect(meetingReminderText('en', at, false).body).toBe('Your meeting starts Thu, Oct 8, 4:30 PM')
  })

  it('asks for a check-in first when one is due', () => {
    const at = new Date('2026-10-08T07:30:00Z')
    expect(meetingReminderText('ja', at, true).body).toBe('打ち合わせは10月8日(木) 16:30からです。その前にチェックインしましょう')
    expect(meetingReminderText('en', at, true).body).toBe('Your meeting starts Thu, Oct 8, 4:30 PM. Check in before then')
  })

  it('names a stalled task literally, with no numbers of progress', () => {
    expect(stalledTaskText('ja', 'スライド', 3).body).toBe('「スライド」が3日止まっています。少しだけでも進めてみませんか')
    expect(stalledTaskText('en', '$& deck', 3).body).toBe('“$& deck” hasn’t moved for 3 days. Even a little progress helps')
  })

  it('matches the "push" keys in messages/*.json', () => {
    expect(PUSH_TEXT.ja).toEqual(ja.push)
    expect(PUSH_TEXT.en).toEqual(en.push)
  })
})
