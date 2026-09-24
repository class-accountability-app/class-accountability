import { describe, expect, it } from 'vitest'
import { localeFromAcceptLanguage, resolveLocale } from './config'

describe('resolveLocale', () => {
  it('uses the locale cookie first', () => {
    expect(resolveLocale('en', 'ja-JP,ja;q=0.9')).toBe('en')
    expect(resolveLocale('ja', 'en-US,en;q=0.9')).toBe('ja')
  })

  it('ignores an unknown cookie value and falls through to the header', () => {
    expect(resolveLocale('de', 'en-US')).toBe('en')
  })

  it('defaults to Japanese with no cookie and no header', () => {
    expect(resolveLocale(undefined, null)).toBe('ja')
  })
})

describe('localeFromAcceptLanguage', () => {
  it('maps ja and ja-* to Japanese', () => {
    expect(localeFromAcceptLanguage('ja')).toBe('ja')
    expect(localeFromAcceptLanguage('ja-JP,ja;q=0.9,en-US;q=0.8')).toBe('ja')
  })

  it('maps any other language to English', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,ja;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('fr-FR')).toBe('en')
    expect(localeFromAcceptLanguage('zh-TW,zh;q=0.9')).toBe('en')
  })

  it('picks the highest q-value, not the first entry', () => {
    expect(localeFromAcceptLanguage('en;q=0.5, ja;q=0.9')).toBe('ja')
    expect(localeFromAcceptLanguage('ja;q=0.1, en')).toBe('en')
  })

  it('skips languages marked q=0', () => {
    expect(localeFromAcceptLanguage('ja;q=0, en;q=0.5')).toBe('en')
  })

  it('does not mistake languages that merely start with "ja"', () => {
    expect(localeFromAcceptLanguage('jam')).toBe('en')
  })

  it('defaults to Japanese for an empty or wildcard header', () => {
    expect(localeFromAcceptLanguage('')).toBe('ja')
    expect(localeFromAcceptLanguage('*')).toBe('ja')
  })
})
