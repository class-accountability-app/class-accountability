import { describe, expect, it } from 'vitest'
import { activeTab, classesHref, isOutsideApp, tabHref } from './nav'

describe('classesHref', () => {
  it('opens the class directly when the student is in exactly one', () => {
    expect(classesHref(['c1'])).toBe('/classes/c1')
  })

  it('opens the class list for none or several', () => {
    expect(classesHref([])).toBe('/classes')
    expect(classesHref(['c1', 'c2'])).toBe('/classes')
  })
})

describe('tabHref', () => {
  it('maps every tab to its page', () => {
    expect(tabHref('home', [])).toBe('/')
    expect(tabHref('classes', ['c1'])).toBe('/classes/c1')
    expect(tabHref('nudges', [])).toBe('/nudges')
    expect(tabHref('settings', [])).toBe('/settings')
  })
})

describe('activeTab', () => {
  it.each([
    ['/', 'home'],
    ['/classes', 'classes'],
    ['/classes/c1', 'classes'],
    ['/classes/c1/progress', 'classes'],
    ['/nudges', 'nudges'],
    ['/settings', 'settings'],
    ['/privacy', null],
    ['/classesfoo', null],
  ])('%s → %s', (pathname, tab) => {
    expect(activeTab(pathname)).toBe(tab)
  })
})

describe('isOutsideApp', () => {
  it.each(['/login', '/auth/confirm', '/auth/signout', '/welcome'])('%s is outside', (p) => {
    expect(isOutsideApp(p)).toBe(true)
  })

  it.each(['/', '/classes', '/settings', '/loginhelp', '/welcomepack'])('%s is inside', (p) => {
    expect(isOutsideApp(p)).toBe(false)
  })
})
