import { describe, expect, it } from 'vitest'
import { checkTeamLink, linkHost } from './team-links'

describe('checkTeamLink', () => {
  it('accepts a title and an https address, trimmed', () => {
    expect(checkTeamLink({ title: '  課題の説明 ', url: ' https://example.com/brief?x=1 ' })).toEqual({
      ok: true,
      value: { title: '課題の説明', url: 'https://example.com/brief?x=1' },
    })
  })

  it('needs a title of 1–60 characters', () => {
    expect(checkTeamLink({ title: '   ', url: 'https://example.com' })).toEqual({ ok: false, problem: 'titleRequired' })
    expect(checkTeamLink({ title: 'あ'.repeat(61), url: 'https://example.com' })).toEqual({ ok: false, problem: 'titleTooLong' })
    expect(checkTeamLink({ title: 'あ'.repeat(60), url: 'https://example.com' }).ok).toBe(true)
  })

  it('refuses anything that is not a plain https link', () => {
    expect(checkTeamLink({ title: 'x', url: '' })).toEqual({ ok: false, problem: 'urlRequired' })
    for (const url of [
      'http://example.com',
      'javascript:alert(1)',
      'data:text/html,hi',
      'example.com',
      'https://',
      'https://example.com/a b',
      'HTTPS://',
      `https://example.com/${'a'.repeat(500)}`,
    ]) {
      expect(checkTeamLink({ title: 'x', url }), url).toEqual({ ok: false, problem: 'urlInvalid' })
    }
  })
})

describe('linkHost', () => {
  it('gives the site without www', () => {
    expect(linkHost('https://www.example.com/a/b')).toBe('example.com')
    expect(linkHost('https://docs.google.com/document/d/1')).toBe('docs.google.com')
    expect(linkHost('not a url')).toBe('')
  })
})
