import type { NextStep } from './next-step'

// Home (Prompt 15, PR 2): where 次にやること goes and which button is the one
// filled button. Plain data in, plain data out, so "at most one filled button"
// can be tested for every state.
//
// The rule: the first thing in rank order that has a button owns the filled
// look.
//   - join, share, invitation, firstTarget, nextTarget: the card, at the top
//     (they come before logging, or there is nothing to log).
//   - logToday: no card; the hero target card's button, which is the action.
//   - pod, invite, seePod: a quiet outlined card UNDER the hero, so a missing
//     pod never takes the place of today's log. A pod prompt is filled only
//     when there is no target left to log (no hero at all).
//   - logged today: the hero stays but its button (もう一度記録) is outlined.

export type HomeLayout = {
  // Where the 次にやること card goes; 'none' for logToday (the hero is the step).
  stepSlot: 'top' | 'under' | 'none'
  // The card's own button is the filled one.
  stepPrimary: boolean
  // The first open target, as a big card; null when nothing is left to log.
  hero: { state: 'log' | 'done'; primary: boolean } | null
}

const TOP_KINDS: NextStep['kind'][] = [
  'join',
  'share',
  'invitation',
  'firstTarget',
  'nextTarget',
  'startProject',
  'openProject',
]

export function homeLayout(step: NextStep, hasOpenTarget: boolean, loggedToday: boolean): HomeLayout {
  const heroState = loggedToday ? 'done' : 'log'

  if (step.kind === 'logToday') {
    return { stepSlot: 'none', stepPrimary: false, hero: { state: 'log', primary: true } }
  }

  if (TOP_KINDS.includes(step.kind)) {
    return {
      stepSlot: 'top',
      stepPrimary: true,
      hero: hasOpenTarget ? { state: heroState, primary: false } : null,
    }
  }

  // pod, invite, seePod
  return {
    stepSlot: 'under',
    stepPrimary: step.kind === 'pod' && !hasOpenTarget,
    hero: hasOpenTarget ? { state: heroState, primary: false } : null,
  }
}

// How many filled buttons Home shows in this layout (the card's own filled
// button, plus the hero's).
export function filledButtons(layout: HomeLayout): number {
  const card = layout.stepSlot !== 'none' && layout.stepPrimary ? 1 : 0
  const hero = layout.hero?.primary ? 1 : 0
  return card + hero
}
