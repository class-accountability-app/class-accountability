// Target types, as allowed by targets.target_type (0001, 0010). The order is
// the order of the 種類 segments on the new-target form (screen 07).
export const TARGET_TYPES = ['character_count', 'word_count', 'study_hours', 'task'] as const

export type TargetType = (typeof TARGET_TYPES)[number]

export function isTargetType(value: string): value is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(value)
}
