// Easier team invites (item E). Pure, so the board and its test agree.

// A team this small shows its invite card near the top of the board, before
// the tasks: finding teammates is the next thing to do. Larger teams keep it
// at the bottom (it disappears when the team reaches the class's limit, 0053).
export const SMALL_TEAM = 3

export function inviteFirst(memberCount: number): boolean {
  return memberCount < SMALL_TEAM
}

// LINE's share link (opens the LINE app on a phone with the text filled in;
// the student picks the chat). The text already contains the join link.
export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`
}

// The id of チームに招待する (the team's code and QR) on the board and the
// class page: 次にやること's 「仲間を誘いましょう」 links to it.
export const TEAM_INVITE_ID = 'team-invite'
