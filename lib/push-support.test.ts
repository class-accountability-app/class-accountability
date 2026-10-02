import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, deviceLabel, getPushState, type PushEnv } from './push-support'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:143.0) Gecko/20100101 Firefox/143.0'

const desktopChrome: PushEnv = {
  userAgent: WINDOWS_CHROME,
  maxTouchPoints: 0,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
  hasVapidKey: true,
}

const iphoneSafariTab: PushEnv = {
  userAgent: IPHONE_SAFARI,
  maxTouchPoints: 5,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: false,
  hasNotification: false,
  permission: null,
  hasVapidKey: true,
}

describe('getPushState', () => {
  it('is available in desktop Chrome', () => {
    expect(getPushState(desktopChrome)).toBe('available')
  })

  it('says to add to the home screen first in an iPhone Safari tab', () => {
    expect(getPushState(iphoneSafariTab)).toBe('ios-install-first')
  })

  it('also for an iPad that reports itself as a Mac', () => {
    expect(getPushState({ ...iphoneSafariTab, userAgent: IPAD_AS_MAC })).toBe('ios-install-first')
  })

  it('is available in the installed iPhone app', () => {
    expect(
      getPushState({ ...iphoneSafariTab, standalone: true, hasPushManager: true, hasNotification: true, permission: 'default' })
    ).toBe('available')
  })

  it('is denied once the student blocked notifications', () => {
    expect(getPushState({ ...desktopChrome, permission: 'denied' })).toBe('denied')
  })

  it('is unsupported without the Push API outside iOS', () => {
    expect(getPushState({ ...desktopChrome, hasPushManager: false })).toBe('unsupported')
  })

  it('is unsupported without a service worker (e.g. the dev server)', () => {
    expect(getPushState({ ...desktopChrome, hasServiceWorker: false })).toBe('unsupported')
  })

  it('is unsupported when no VAPID key is configured', () => {
    expect(getPushState({ ...desktopChrome, hasVapidKey: false })).toBe('unsupported')
  })
})

describe('deviceLabel', () => {
  it.each([
    [IPHONE_SAFARI, 5, 'Safari · iPhone'],
    [IPHONE_CHROME, 5, 'Chrome · iPhone'],
    [IPAD_AS_MAC, 5, 'Safari · iPad'],
    [WINDOWS_CHROME, 0, 'Chrome · Windows'],
    [WINDOWS_EDGE, 0, 'Edge · Windows'],
    [ANDROID_CHROME, 5, 'Chrome · Android'],
    [MAC_FIREFOX, 0, 'Firefox · Mac'],
    ['curl/8.0', 0, 'Browser · Other'],
  ])('%s → %s', (ua, touch, label) => {
    expect(deviceLabel(ua as string, touch as number)).toBe(label)
  })

  it('stays within the 64 characters the database allows', () => {
    expect(deviceLabel(WINDOWS_EDGE, 0).length).toBeLessThanOrEqual(64)
  })
})

describe('base64UrlToBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...base64UrlToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
  })
})
