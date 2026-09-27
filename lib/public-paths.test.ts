import { describe, expect, it } from 'vitest'
import { isPublicPath, skipsNameCheck } from './public-paths'

describe('isPublicPath', () => {
  it.each(['/', '/privacy', '/robots.txt', '/sitemap.xml', '/login', '/auth/confirm', '/auth/callback'])(
    '%s is public',
    (path) => {
      expect(isPublicPath(path)).toBe(true)
    }
  )

  it.each([
    '/classes',
    '/classes/abc/progress',
    '/join/K7M3Q9TX',
    '/welcome',
    '/settings',
    '/nudges',
    '/privacy/extra',
    '/privacyx',
    '/loginx',
    '/authorize',
  ])('%s still needs a login', (path) => {
    expect(isPublicPath(path)).toBe(false)
  })
})

describe('skipsNameCheck', () => {
  it('lets /privacy through before a name is chosen', () => {
    expect(skipsNameCheck('/privacy')).toBe(true)
    expect(skipsNameCheck('/')).toBe(false)
  })
})
