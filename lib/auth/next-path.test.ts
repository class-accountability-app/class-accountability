import { describe, expect, it } from 'vitest'
import { nextFromRedirectTo, safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it.each([
    '/',
    '/classes',
    '/classes/1b2c/progress',
    '/join/abc123?from=qr',
    '/classes#pod',
    '/classes/a%20b',
  ])('keeps the relative path %s', (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a protocol-relative URL', '//evil.example'],
    ['a protocol-relative URL with a path', '//evil.example/classes'],
    ['a full https URL', 'https://evil.example'],
    ['a full http URL', 'http://evil.example/classes'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,hi'],
    ['a path without a leading slash', 'classes'],
    ['a backslash after the slash', '/\\evil.example'],
    ['a leading backslash', '\\\\evil.example'],
    ['a backslash anywhere', '/classes\\..\\x'],
    ['an encoded second slash', '/%2Fevil.example'],
    ['an encoded backslash', '/%5Cevil.example'],
    ['an encoded double slash', '%2F%2Fevil.example'],
    ['a tab between the slashes', '/\t/evil.example'],
    ['a newline between the slashes', '/\n/evil.example'],
    ['broken percent-encoding', '/%E0%A4%A'],
    ['the login page', '/login'],
    ['the login page with a query', '/login?next=/classes'],
    ['an auth route', '/auth/confirm?token_hash=x'],
  ])('rejects %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBe('/')
  })

  it('keeps paths that only start like an auth route', () => {
    expect(safeNextPath('/loginhelp')).toBe('/loginhelp')
    expect(safeNextPath('/authors')).toBe('/authors')
  })
})

describe('nextFromRedirectTo', () => {
  it('takes the inner next from the callback URL', () => {
    expect(
      nextFromRedirectTo('https://www.study-pods.org/auth/callback?next=%2Fjoin%2Fabc123')
    ).toBe('/join/abc123')
  })

  it('goes Home when the callback URL has no next', () => {
    expect(nextFromRedirectTo('https://www.study-pods.org/auth/callback')).toBe('/')
  })

  it('goes Home for the bare Site URL (the default RedirectTo)', () => {
    expect(nextFromRedirectTo('https://www.study-pods.org')).toBe('/')
  })

  it('keeps the path of any other URL on the site', () => {
    expect(nextFromRedirectTo('https://www.study-pods.org/classes/1b2c')).toBe('/classes/1b2c')
  })

  it('keeps only the path of another origin, never the origin', () => {
    expect(nextFromRedirectTo('https://evil.example/classes')).toBe('/classes')
  })

  it.each([
    ['an unsafe inner next', 'https://www.study-pods.org/auth/callback?next=%2F%2Fevil.example'],
    ['an inner full URL', 'https://www.study-pods.org/auth/callback?next=https%3A%2F%2Fevil.example'],
    ['a protocol-relative value', '//evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a path that becomes // on another origin', 'https://evil.example//evil2.example'],
    ['not a URL', 'not a url'],
    ['nothing', null],
  ])('goes Home for %s', (_label, raw) => {
    expect(nextFromRedirectTo(raw)).toBe('/')
  })

  it('checks a relative value like safeNextPath', () => {
    expect(nextFromRedirectTo('/classes')).toBe('/classes')
  })
})
