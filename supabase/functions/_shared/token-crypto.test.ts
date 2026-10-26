import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from './token-crypto'

// Throwaway keys made for this test only.
const key = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)))
const otherKey = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 255 - i)))

describe('token crypto', () => {
  it('round-trips, with a fresh IV each time', async () => {
    const a = await encryptToken('1//refresh-token-example', key)
    const b = await encryptToken('1//refresh-token-example', key)
    expect(a).not.toBe(b)
    expect(a.startsWith('v1.')).toBe(true)
    expect(a).not.toContain('refresh-token-example')
    expect(await decryptToken(a, key)).toBe('1//refresh-token-example')
  })

  it('refuses another key, a changed blob and junk', async () => {
    const sealed = await encryptToken('secret', key)
    expect(await decryptToken(sealed, otherKey)).toBeNull()
    const [v, iv, ct] = sealed.split('.')
    const flipped = ct[0] === 'A' ? 'B' + ct.slice(1) : 'A' + ct.slice(1)
    expect(await decryptToken(`${v}.${iv}.${flipped}`, key)).toBeNull()
    expect(await decryptToken('not-a-token', key)).toBeNull()
    expect(await decryptToken('v2.a.b', key)).toBeNull()
  })

  it('rejects a key of the wrong length', async () => {
    await expect(encryptToken('x', btoa('short'))).rejects.toThrow('32 bytes')
  })
})
