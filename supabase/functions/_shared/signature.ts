// Checks that a call to send-nudge-push came from our database (0018's
// private.call_push_function): x-push-signature must be the hex
// HMAC-SHA256 of "<timestamp>.<body>" with the shared secret, and the
// timestamp must be within 5 minutes. The secret itself never travels.
// WebCrypto's verify compares in constant time.

export const MAX_CLOCK_SKEW_SECONDS = 300

const HEX_SHA256 = /^[0-9a-f]{64}$/
const UNIX_SECONDS = /^\d{1,12}$/

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export async function verifySignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!secret || !timestamp || !signature) return false
  if (!UNIX_SECONDS.test(timestamp) || !HEX_SHA256.test(signature)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify('HMAC', key, hexToBytes(signature), encoder.encode(`${timestamp}.${body}`))
}
