// The project's contact address: the delete-account page, the privacy policy
// and the public footer all use it.
export const CONTACT_EMAIL = 'contact@study-pods.org'

export const PRIVACY_POLICY_PATH = '/privacy'

// 設定 → アカウントを削除.
export const DELETE_ACCOUNT_PATH = '/settings/delete-account'

// Where the landing page says 「アカウントを削除しました」 (only a notice; anyone
// can open it, and it says nothing about who was deleted).
export const ACCOUNT_DELETED_PATH = '/?deleted=1'

export function dataDeletionHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
