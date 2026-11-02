// The pilot's feedback form (2026-11-02): 設定's 「アンケートに答える」 row opens
// it. The URL comes from NEXT_PUBLIC_FEEDBACK_URL, so the author can swap or
// remove the form without a code change; the row is hidden when it is unset.
// Only a Google Form is accepted, over https, so a typo in the variable can
// never send students somewhere else.

const FORM_HOSTS = new Set(['docs.google.com', 'forms.gle'])

export function feedbackUrl(raw: string | undefined): string | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !FORM_HOSTS.has(url.hostname)) return null
  if (url.hostname === 'docs.google.com' && !url.pathname.startsWith('/forms/')) return null
  return url.toString()
}
