// Project tasks: the vocabulary and the rules a task must satisfy. The database
// enforces the same rules with CHECK constraints (0022); this runs first so the
// form can answer with a specific message instead of a constraint error.

export const TASK_METRICS = ['status', 'count', 'characters'] as const
export type TaskMetric = (typeof TASK_METRICS)[number]

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_INPUT_MODES = ['manual', 'document'] as const
export type TaskInputMode = (typeof TASK_INPUT_MODES)[number]

// Where a task's numbers come from. Only 'manual' and 'document' are built;
// 'google_docs' is reserved for phase 3 so integrations plug in without a
// schema change.
export const TASK_SOURCES = ['manual', 'document', 'google_docs'] as const
export type TaskSource = (typeof TASK_SOURCES)[number]

export function isTaskMetric(value: unknown): value is TaskMetric {
  return typeof value === 'string' && (TASK_METRICS as readonly string[]).includes(value)
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

export const TITLE_MAX = 120
export const UNIT_MAX = 20

export type TaskInput = {
  title: string
  metric: TaskMetric
  unit: string // used by 'count' only
  targetAmount: number | null // used by 'count' and 'characters'
  inputMode: TaskInputMode
}

export type TaskProblem =
  | 'titleRequired'
  | 'titleTooLong'
  | 'unitRequired'
  | 'unitTooLong'
  | 'amountInvalid'
  | 'documentNeedsCharacters'

export type TaskCheck =
  | { ok: true; value: { title: string; metric: TaskMetric; unit: string | null; targetAmount: number | null; inputMode: TaskInputMode } }
  | { ok: false; problem: TaskProblem }

const length = (text: string) => [...text].length // code points, like the database's char_length

// Trims, then applies the database's rules: a status task has no goal, a count
// has a unit, characters have no unit, and writing in Study Pods counts
// characters. A goal, when given, is a positive number.
export function checkTask(input: TaskInput): TaskCheck {
  const title = input.title.trim()
  if (title === '') return { ok: false, problem: 'titleRequired' }
  if (length(title) > TITLE_MAX) return { ok: false, problem: 'titleTooLong' }
  if (input.inputMode === 'document' && input.metric !== 'characters') {
    return { ok: false, problem: 'documentNeedsCharacters' }
  }

  let unit: string | null = null
  if (input.metric === 'count') {
    unit = input.unit.trim()
    if (unit === '') return { ok: false, problem: 'unitRequired' }
    if (length(unit) > UNIT_MAX) return { ok: false, problem: 'unitTooLong' }
  }

  let targetAmount: number | null = null
  if (input.metric !== 'status' && input.targetAmount !== null) {
    if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
      return { ok: false, problem: 'amountInvalid' }
    }
    targetAmount = input.targetAmount
  }

  return { ok: true, value: { title, metric: input.metric, unit, targetAmount, inputMode: input.inputMode } }
}
