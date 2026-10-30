// 次にやること (Prompt 11b, project first since 2026-10-30): the one most
// useful thing a student can do next, on Home (across their classes) and on a
// class page (that class only). Plain data in, plain data out: the card picks
// the words and the button.
//
// In order, the first that applies:
//   no class as a student    → join (or share the link, for an organizer)
//   invited to a team        → see the invitation
//   a team without a project → start the project
//   no team                  → start or join a team
//   alone in a team          → invite classmates (the team QR is on the board)
//   otherwise                → open the project

export type NextStepClass = {
  id: string
  name: string
  organizer: boolean
  // My active team here and how many are in it, or null for no team.
  podSize: number | null
  // A pending invitation to a team in this class, addressed to me.
  invited: boolean
  // My team's project here.
  project: 'none' | 'started'
}

export type NextStep =
  | { kind: 'join' }
  | { kind: 'share'; classId: string; className: string }
  | { kind: 'invitation'; classId: string; className: string }
  | { kind: 'startProject'; classId: string; className: string }
  | { kind: 'pod'; classId: string; className: string }
  | { kind: 'invite'; classId: string; className: string }
  | { kind: 'openProject'; classId: string; className: string }

export function nextStep({
  classes,
}: {
  // In the order the student joined them.
  classes: NextStepClass[]
}): NextStep {
  const studying = classes.filter((c) => !c.organizer)
  if (studying.length === 0) {
    const organized = classes.find((c) => c.organizer)
    return organized ? { kind: 'share', classId: organized.id, className: organized.name } : { kind: 'join' }
  }
  const step = (kind: Exclude<NextStep['kind'], 'join'>, c: NextStepClass) =>
    ({ kind, classId: c.id, className: c.name }) as NextStep

  const invited = studying.find((c) => c.podSize === null && c.invited)
  if (invited) return step('invitation', invited)

  const toStart = studying.find((c) => c.podSize !== null && c.project === 'none')
  if (toStart) return step('startProject', toStart)

  const teamless = studying.find((c) => c.podSize === null)
  if (teamless) return step('pod', teamless)

  const alone = studying.find((c) => c.podSize === 1)
  if (alone) return step('invite', alone)

  return step('openProject', studying.find((c) => c.project === 'started') ?? studying[0])
}
