import { describe, expect, it } from 'vitest'
import { gmailInboxUrl } from './mail-links'

describe('gmailInboxUrl', () => {
  it('opens Gmail on the account the code was sent to', () => {
    expect(gmailInboxUrl('23b0000@andrew.ac.jp')).toBe(
      'https://mail.google.com/mail/u/?authuser=23b0000%40andrew.ac.jp'
    )
  })

  it('encodes characters that would break out of the parameter', () => {
    const url = new URL(gmailInboxUrl('a+b&x=1#y@andrew.ac.jp'))
    expect(url.origin).toBe('https://mail.google.com')
    expect([...url.searchParams.keys()]).toEqual(['authuser'])
    expect(url.searchParams.get('authuser')).toBe('a+b&x=1#y@andrew.ac.jp')
    expect(url.hash).toBe('')
  })
})
