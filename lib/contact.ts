// The project's contact address: 設定's data-deletion link, the privacy
// policy and the public footer all use it.
export const CONTACT_EMAIL = 'contact@study-pods.org'

export const PRIVACY_POLICY_PATH = '/privacy'

export function dataDeletionHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
