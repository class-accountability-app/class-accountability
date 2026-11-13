// チームのリンク (0043): the rules for a link the team pins on its board, the
// same ones the database enforces (project_links' checks), so the form can
// say what is wrong before anything is sent. Pure, so it is tested.

export const TEAM_LINKS_MAX = 10
export const TEAM_LINK_TITLE_MAX = 60
export const TEAM_LINK_URL_MAX = 500

export type TeamLinkProblem = 'titleRequired' | 'titleTooLong' | 'urlRequired' | 'urlInvalid'

const CONTROL = /[\u0000-\u001f\u007f]/

// A trimmed title and an https address, or what is wrong. Only https: an
// address that isn't a plain web link (javascript:, data:, http:) is refused,
// so a stored link is always safe to put in an href.
export function checkTeamLink(input: {
  title: string
  url: string
}): { ok: true; value: { title: string; url: string } } | { ok: false; problem: TeamLinkProblem } {
  const title = input.title.trim()
  if (title === '') return { ok: false, problem: 'titleRequired' }
  if ([...title].length > TEAM_LINK_TITLE_MAX || CONTROL.test(title)) return { ok: false, problem: 'titleTooLong' }

  const raw = input.url.trim()
  if (raw === '') return { ok: false, problem: 'urlRequired' }
  if (raw.length > TEAM_LINK_URL_MAX || /\s/.test(raw) || CONTROL.test(raw)) return { ok: false, problem: 'urlInvalid' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, problem: 'urlInvalid' }
  }
  if (parsed.protocol !== 'https:' || parsed.hostname === '' || !raw.toLowerCase().startsWith('https://')) {
    return { ok: false, problem: 'urlInvalid' }
  }
  return { ok: true, value: { title, url: raw } }
}

// The site a link goes to ("docs.google.com"), shown under its title so the
// team can see where a tap will take them. Empty if the address can't be read.
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
