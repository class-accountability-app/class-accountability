// コードで参加: turns what a student typed (or pasted) into a join code, or
// null if it can't be one. The database normalises again (0012, 0013); this
// only lets the form catch typos before leaving the page.

// Same alphabet as generate_join_code() (0012): no 0/O, 1/I/L.
const CODE = /^[A-HJKMNP-Z2-9]{8}$/

export function normalizeJoinCode(input: string): string | null {
  // NFKC turns full-width letters, digits, spaces and hyphens from a
  // Japanese keyboard ("ｋ７ｍ３－Ｑ９ＴＸ") into plain ones.
  let text = input.normalize('NFKC').trim()

  // A pasted link: keep what follows /join/ (up to any ?, # or /).
  const linkMatch = text.match(/\/join\/([^/?#]+)/i)
  if (linkMatch) {
    try {
      text = decodeURIComponent(linkMatch[1])
    } catch {
      return null // a malformed %-escape
    }
  }

  const code = text.toUpperCase().replace(/[\s\-‐‑‒–—−]/g, '')
  return CODE.test(code) ? code : null
}
