// Where the settings page sends students for privacy questions.

// TODO: the real address arrives in a later prompt. Until then the "request
// data deletion" link is a mailto: with no recipient, so the student's mail
// app opens with the subject filled in and they can't send it by mistake to a
// wrong address.
export const CONTACT_EMAIL = ''

// Built in prompt 6, before the pilot. Until then this shows the 404 page.
export const PRIVACY_POLICY_PATH = '/privacy'

export function dataDeletionHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
