import { describe, expect, it } from 'vitest'
import { verifySignature } from './signature'

// Computed by Postgres on the live project (pgcrypto, as 0018 signs):
//   encode(extensions.hmac('1790000000.{"nudge_id": "00000000-0000-4000-8000-000000000001"}',
//          'test-secret', 'sha256'), 'hex')
// So this checks the two implementations agree, not just this one.
const SECRET = 'test-secret'
const TIMESTAMP = '1790000000'
const BODY = '{"nudge_id": "00000000-0000-4000-8000-000000000001"}'
const SIGNATURE = 'c5b0cb11e162a825c55e1882723404736d4e29bc0fac43a890031e1bfe4103f1'
const AT = 1790000000 * 1000

describe('verifySignature', () => {
  it('accepts the signature Postgres computed', async () => {
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE, BODY, AT)).toBe(true)
  })

  it('refuses a missing signature or timestamp', async () => {
    expect(await verifySignature(SECRET, null, SIGNATURE, BODY, AT)).toBe(false)
    expect(await verifySignature(SECRET, TIMESTAMP, null, BODY, AT)).toBe(false)
  })

  it('refuses when no secret is configured', async () => {
    expect(await verifySignature('', TIMESTAMP, SIGNATURE, BODY, AT)).toBe(false)
  })

  it('refuses the wrong secret', async () => {
    expect(await verifySignature('other-secret', TIMESTAMP, SIGNATURE, BODY, AT)).toBe(false)
  })

  it('refuses a changed body', async () => {
    const changed = BODY.replace('0001', '0002')
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE, changed, AT)).toBe(false)
  })

  it('refuses a malformed signature', async () => {
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE.toUpperCase(), BODY, AT)).toBe(false)
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE.slice(2), BODY, AT)).toBe(false)
  })

  it('accepts up to 5 minutes of clock difference, not more', async () => {
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE, BODY, AT + 300_000)).toBe(true)
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE, BODY, AT + 301_000)).toBe(false)
    expect(await verifySignature(SECRET, TIMESTAMP, SIGNATURE, BODY, AT - 301_000)).toBe(false)
  })
})
