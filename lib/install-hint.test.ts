import { describe, expect, it } from 'vitest'
import { getInstallHint, type InstallEnv } from './install-hint'

// Real user-agent strings (versions trimmed where they don't matter).
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneLine:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.4.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 380.0.0.0.0 (iPhone15,2; iOS 18_5; ja_JP; ja)',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.0.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  androidLine:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36 Line/15.4.1/IAB',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
}

function env(userAgent: string, over: Partial<InstallEnv> = {}): InstallEnv {
  const touch = /iPhone|Android/.test(userAgent) ? 5 : 0
  return { userAgent, maxTouchPoints: touch, standalone: false, promptAvailable: false, ...over }
}

describe('getInstallHint', () => {
  it('iPhone Safari: the share-menu steps', () => {
    expect(getInstallHint(env(UA.iphoneSafari))).toBe('ios')
  })

  it('iPhone LINE or Instagram: open in Safari first', () => {
    expect(getInstallHint(env(UA.iphoneLine))).toBe('ios-in-app')
    expect(getInstallHint(env(UA.iphoneInstagram))).toBe('ios-in-app')
  })

  it('iPhone Chrome: the share-menu steps too (iOS 16.4+)', () => {
    expect(getInstallHint(env(UA.iphoneChrome))).toBe('ios')
  })

  it('iPad (reports as a Mac, but has touch): the share-menu steps', () => {
    expect(getInstallHint(env(UA.ipad, { maxTouchPoints: 5 }))).toBe('ios')
  })

  it('Android Chrome with the install prompt: the install button', () => {
    expect(getInstallHint(env(UA.androidChrome, { promptAvailable: true }))).toBe('prompt')
  })

  it('Android Chrome before (or without) the prompt: nothing', () => {
    expect(getInstallHint(env(UA.androidChrome))).toBe('none')
  })

  it("Android LINE: open in a browser first, even if a prompt somehow arrived", () => {
    expect(getInstallHint(env(UA.androidLine, { promptAvailable: true }))).toBe('in-app')
  })

  it('already installed: nothing, on every platform', () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneLine, UA.androidChrome]) {
      expect(getInstallHint(env(ua, { standalone: true, promptAvailable: true }))).toBe('installed')
    }
  })

  it('Mac Safari and desktop Firefox without a prompt: nothing', () => {
    expect(getInstallHint(env(UA.macSafari))).toBe('none')
    expect(getInstallHint(env(UA.desktopFirefox))).toBe('none')
  })
})
