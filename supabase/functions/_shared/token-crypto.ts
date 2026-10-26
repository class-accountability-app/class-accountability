// Encrypts a student's Google refresh token before it is stored (0023's
// private.google_credentials) and decrypts it where it is used: the Next.js
// server and the sync-google-progress Edge Function. AES-256-GCM with the
// server key GOOGLE_TOKEN_KEY (32 random bytes, base64), WebCrypto only, so
// the same code runs in Node and Deno. The database only ever sees
// "v1.<iv>.<ciphertext>" (base64url); without the key it is useless.

const VERSION = 'v1'
const IV_BYTES = 12

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64(keyBase64.trim())
  if (raw.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes, base64')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptToken(plain: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(sealed)}`
}

// Null when the blob is malformed, was made with another key, or was changed
// (GCM's tag fails): the caller treats that as "not connected".
export async function decryptToken(blob: string, keyBase64: string): Promise<string | null> {
  const parts = blob.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  try {
    const key = await importKey(keyBase64)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parts[1]) }, key, fromBase64(parts[2]))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
