import type { TaskLike } from '@/lib/project-stats'
import type { visibleTotal } from '@/lib/project-board'
import type { SourceKind } from '@/lib/google-links'

// One task as the board shows it: the numbers a viewer may see (`shown`), on
// top of what the progress helpers need.
export type BoardTask = TaskLike & {
  title: string
  unit: string | null
  inputMode: 'manual' | 'document'
  shown: ReturnType<typeof visibleTotal>
}

// What a task is counted from (task_sources, 0023): no numbers.
export type SourceRow = {
  task_id: string
  kind: SourceKind
  file_id: string
  label: string | null
  state: 'ok' | 'lost_access'
}
