import { describe, expect, it } from 'vitest'
import { qrSvg } from './qr'

describe('qrSvg', () => {
  it('returns a scalable SVG with no fixed size', async () => {
    const svg = await qrSvg('https://www.study-pods.org/join/K7M3Q9TX')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox=')
    expect(svg).not.toMatch(/<svg[^>]*\swidth=/)
  })

  it('does not embed the link as text', async () => {
    const svg = await qrSvg('https://www.study-pods.org/join/K7M3Q9TX')
    expect(svg).not.toContain('K7M3Q9TX')
  })
})
