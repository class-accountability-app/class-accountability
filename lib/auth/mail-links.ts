// Links from the code screen to the student's university inbox. The
// university email works in both Gmail (Google Workspace) and Outlook.

// authuser picks the university account when a personal Gmail is signed in
// too. This link is the only place the address goes: never into our own URLs
// or logs.
export function gmailInboxUrl(email: string): string {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}`
}

export const OUTLOOK_INBOX_URL = 'https://outlook.office.com/mail/'
