import { describe, expect, it } from 'vitest'
import { feedbackUrl } from './feedback'

describe('feedbackUrl', () => {
  it('accepts a Google Form over https', () => {
    expect(feedbackUrl('https://forms.gle/abc123')).toBe('https://forms.gle/abc123')
    expect(feedbackUrl(' https://docs.google.com/forms/d/e/xyz/viewform ')).toBe(
      'https://docs.google.com/forms/d/e/xyz/viewform'
    )
  })
  it('refuses anything else, and unset', () => {
    expect(feedbackUrl(undefined)).toBeNull()
    expect(feedbackUrl('')).toBeNull()
    expect(feedbackUrl('http://forms.gle/abc')).toBeNull()
    expect(feedbackUrl('https://docs.google.com/document/d/x')).toBeNull()
    expect(feedbackUrl('https://example.com/forms/x')).toBeNull()
    expect(feedbackUrl('javascript:alert(1)')).toBeNull()
  })
})
