import { describe, expect, it } from 'vitest'
import {
  activeTab,
  classesHref,
  hidesTabBar,
  isOutsideApp,
  showsHeaderSignOutOnPhones,
  tabHref,
} from './nav'

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

  it.each(['/', '/classes', '/settings', '/loginhelp', '/welcomepack', '/join/K7M3Q9TX'])(
    '%s is inside',
    (p) => {
      expect(isOutsideApp(p)).toBe(false)
    }
  )
})

describe('hidesTabBar', () => {
  it.each(['/login', '/auth/confirm', '/welcome', '/join/K7M3Q9TX', '/join'])('%s has no tab bar', (p) => {
    expect(hidesTabBar(p)).toBe(true)
  })

  it.each(['/', '/classes/c1', '/joinus', '/settings'])('%s has the tab bar', (p) => {
    expect(hidesTabBar(p)).toBe(false)
  })
})

describe('showsHeaderSignOutOnPhones', () => {
  it('only where there is no tab bar to reach 設定 from', () => {
    expect(showsHeaderSignOutOnPhones('/welcome')).toBe(true)
    expect(showsHeaderSignOutOnPhones('/join/K7M3Q9TX')).toBe(true)
    expect(showsHeaderSignOutOnPhones('/')).toBe(false)
    expect(showsHeaderSignOutOnPhones('/settings')).toBe(false)
  })
})
