import { describe, expect, it } from 'vitest'
import ja from '@/messages/ja.json'
import en from '@/messages/en.json'
import { PUSH_TEXT, pushText } from './push-text'

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

  it('matches the "push" keys in messages/*.json', () => {
    expect(PUSH_TEXT.ja).toEqual(ja.push)
    expect(PUSH_TEXT.en).toEqual(en.push)
  })
})
