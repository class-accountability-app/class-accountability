import { tokyoDaysAgo, tokyoDaysUntil } from './date'
import { sortHomeTargets } from './home-targets'
import type { TargetType } from './targets'

// 次にやること (Prompt 11b): the one most useful thing a student can do next,
// on Home (across their classes) and on a class page (that class only). It
// replaced はじめの3ステップ. Plain data in, plain data out: the card picks
// the words and the button.
//
// In order, the first that applies:
//   no class as a student   → join (or share the link, for an organizer)
//   invited to a pod        → see the invitation
//   a class without a pod   → start (or ask to join) a pod
//   a pod without a target  → set a first target in that class
//   nothing logged today    → log today (the card points at ＋記録; no button),
//                             or, for a 「Study Pods で書く」 target, keep
//                             writing (an outlined 続きを書く button)
//   logged today, alone     → invite classmates
//   logged today            → see the pod's progress
//   every target finished   → set the next target

export type NextStepClass = {
  id: string
  name: string
  organizer: boolean
  // My active pod here and how many are in it, or null for no pod.
  podSize: number | null
  // A pending invitation to a pod in this class, addressed to me.
  invited: boolean
}

export type NextStepTarget = {
  id: string
  classId: string
  title: string
  type: TargetType
  targetAmount: number | null
  deadline: string | null
  createdAt: string
  total: number
  inputMode: 'manual' | 'document'
}

export type NextStep =
  | { kind: 'join' }
  | { kind: 'share'; classId: string; className: string }
  | { kind: 'invitation'; classId: string; className: string }
  | { kind: 'pod'; classId: string; className: string }
  | { kind: 'firstTarget'; classId: string; className: string }
  | {
      kind: 'logToday'
      classId: string
      target: NextStepTarget
      remaining: number | null
      daysLeft: number | null
      // The target is written in the app: 続きを書く opens its editor.
      write: boolean
    }
  | { kind: 'invite'; classId: string; className: string }
  | { kind: 'seePod'; classId: string; className: string }
  | { kind: 'nextTarget'; classId: string; className: string }

export function isFinished(t: Pick<NextStepTarget, 'type' | 'targetAmount' | 'total'>): boolean {
  return t.type === 'task' ? t.total >= 1 : t.targetAmount !== null && t.total >= t.targetAmount
}

export function nextStep({
  classes,
  targets,
  loggedToday,
  now,
}: {
  // In the order the student joined them.
  classes: NextStepClass[]
  // My targets (in these classes).
  targets: NextStepTarget[]
  // Whether I logged anything today (Tokyo).
  loggedToday: boolean
  now: Date
}): NextStep {
  const studying = classes.filter((c) => !c.organizer)
  if (studying.length === 0) {
    const organized = classes.find((c) => c.organizer)
    return organized ? { kind: 'share', classId: organized.id, className: organized.name } : { kind: 'join' }
  }

  const invited = studying.find((c) => c.podSize === null && c.invited)
  if (invited) return { kind: 'invitation', classId: invited.id, className: invited.name }

  const noPod = studying.find((c) => c.podSize === null)
  if (noPod) return { kind: 'pod', classId: noPod.id, className: noPod.name }

  const noTarget = studying.find((c) => !targets.some((t) => t.classId === c.id))
  if (noTarget) return { kind: 'firstTarget', classId: noTarget.id, className: noTarget.name }

  const classOf = (id: string) => studying.find((c) => c.id === id)
  const open = sortHomeTargets(
    targets
      .filter((t) => classOf(t.classId))
      .map((t) => ({ ...t, finished: isFinished(t) }))
  ).filter((t) => !t.finished)

  if (open.length === 0) {
    // Everything reached: the next target goes in the most recent class.
    const last = studying[studying.length - 1]
    return { kind: 'nextTarget', classId: last.id, className: last.name }
  }

  const urgent = open[0]
  if (!loggedToday) {
    return {
      kind: 'logToday',
      classId: urgent.classId,
      target: urgent,
      remaining:
        urgent.type === 'task' || urgent.targetAmount === null
          ? null
          : Math.round((urgent.targetAmount - urgent.total) * 100) / 100,
      daysLeft: urgent.deadline === null ? null : tokyoDaysUntil(urgent.deadline, now),
      write: urgent.inputMode === 'document',
    }
  }

  const alone = studying.find((c) => c.podSize === 1)
  if (alone) return { kind: 'invite', classId: alone.id, className: alone.name }

  const urgentClass = classOf(urgent.classId)!
  return { kind: 'seePod', classId: urgentClass.id, className: urgentClass.name }
}

// Whether any of these logs was made today, Tokyo time.
export function loggedOnTokyoDay(loggedAt: string[], now: Date): boolean {
  return loggedAt.some((at) => tokyoDaysAgo(at, now) === 0)
}
