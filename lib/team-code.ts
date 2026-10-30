// The team join code (0028, project first): /team/{code} joins a pod. Same
// alphabet and length as the class code (lib/join-code.ts); the database
// makes sure a code never means a class and a team at once, and normalises
// again. This only tidies what a student typed or pasted.

const CODE = /^[A-HJKMNP-Z2-9]{8}$/

export function normalizeTeamCode(input: string): string | null {
  // NFKC: full-width letters, digits, spaces and hyphens from a Japanese keyboard.
  let text = input.normalize('NFKC').trim()

  // A pasted link: keep what follows /team/ (up to any ?, # or /).
  const linkMatch = text.match(/\/team\/([^/?#]+)/i)
  if (linkMatch) {
    try {
      text = decodeURIComponent(linkMatch[1])
    } catch {
      return null
    }
  }

  const code = text.toUpperCase().replace(/[\s\-‐‑‒–—−]/g, '')
  return CODE.test(code) ? code : null
}

// The full link: what the QR code encodes and what コピー copies.
export function teamJoinUrl(origin: string, code: string): string {
  return `${origin}/team/${encodeURIComponent(code)}`
}
