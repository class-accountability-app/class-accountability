import type { ErrorKey } from './errors'
import { tokyoToday } from './date'
import { TITLE_MAX, checkTask, isTaskMetric, parseWholeAmount, type TaskMetric, type TaskProblem } from './tasks'

// The class project (0029): what the organizer's form sends and what
// set_class_project() stores. Pure, so the form and the server action apply
// the same rules as project_tasks' own checks: a task the database would
// refuse is caught here, not silently skipped when a team starts.

export const CLASS_PROJECT_MAX_TASKS = 30
const DAYS_BEFORE_MAX = 365

export type ClassProjectTaskRow = {
  title: string
  metric: TaskMetric
  unit: string
  target: string // as typed; empty = no goal
  daysBefore: string // as typed; empty = no due date
}

export type ClassProjectInput = {
  title: string
  deadline: string // 'YYYY-MM-DD' or ''
  every: string
  tasks: ClassProjectTaskRow[]
}

// What set_class_project() takes (p_tasks is this JSON).
export type ClassProjectTask = {
  title: string
  metric: TaskMetric
  unit?: string
  target?: number
  days_before?: number
}

export type ClassProjectCheck =
  | { ok: true; value: { title: string; deadline: string | null; every: number; tasks: ClassProjectTask[] } }
  | { ok: false; problem: ErrorKey; taskIndex: number | null }

const TASK_PROBLEM_KEY: Record<TaskProblem, ErrorKey> = {
  titleRequired: 'titleRequired',
  titleTooLong: 'titleTooLong',
  unitRequired: 'unitRequired',
  unitTooLong: 'unitTooLong',
  amountInvalid: 'targetAmountPositive',
  documentNeedsCharacters: 'generic',
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function checkClassProject(input: ClassProjectInput, now: Date = new Date()): ClassProjectCheck {
  const fail = (problem: ErrorKey, taskIndex: number | null = null): ClassProjectCheck => ({ ok: false, problem, taskIndex })

  const title = input.title.trim()
  if (title === '') return fail('titleRequired')
  if ([...title].length > TITLE_MAX) return fail('titleTooLong')

  const deadline = input.deadline.trim() || null
  if (deadline !== null && (!YMD.test(deadline) || deadline < tokyoToday(now))) return fail('deadlineInPast')

  const every = parseWholeAmount(input.every)
  if (every === null || every > 14) return fail('checkinEveryInvalid')

  if (input.tasks.length > CLASS_PROJECT_MAX_TASKS) return fail('classProjectTooManyTasks')

  const tasks: ClassProjectTask[] = []
  for (const [i, row] of input.tasks.entries()) {
    if (!isTaskMetric(row.metric)) return fail('generic', i)
    let target: number | null = null
    if (row.metric !== 'status' && row.target.trim() !== '') {
      target = parseWholeAmount(row.target)
      if (target === null) return fail('targetAmountPositive', i)
    }
    const checked = checkTask({ title: row.title, metric: row.metric, unit: row.unit, targetAmount: target, inputMode: 'manual' })
    if (!checked.ok) return fail(TASK_PROBLEM_KEY[checked.problem], i)

    let daysBefore: number | null = null
    const rawDays = row.daysBefore.normalize('NFKC').trim()
    if (rawDays !== '') {
      if (!/^\d+$/.test(rawDays) || Number(rawDays) > DAYS_BEFORE_MAX) return fail('classProjectDaysInvalid', i)
      daysBefore = Number(rawDays)
    }

    const task: ClassProjectTask = { title: checked.value.title, metric: checked.value.metric }
    if (checked.value.unit !== null) task.unit = checked.value.unit
    if (checked.value.targetAmount !== null) task.target = checked.value.targetAmount
    if (daysBefore !== null) task.days_before = daysBefore
    tasks.push(task)
  }

  return { ok: true, value: { title, deadline, every, tasks } }
}

// The stored JSON back into form rows (anything odd becomes an empty field).
export function rowsFromTasks(raw: unknown): ClassProjectTaskRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((t): ClassProjectTaskRow[] => {
    if (typeof t !== 'object' || t === null) return []
    const r = t as Record<string, unknown>
    const metric = isTaskMetric(r.metric) ? r.metric : 'status'
    return [
      {
        title: typeof r.title === 'string' ? r.title : '',
        metric,
        unit: typeof r.unit === 'string' ? r.unit : '',
        target: typeof r.target === 'number' ? String(r.target) : '',
        daysBefore: typeof r.days_before === 'number' ? String(r.days_before) : '',
      },
    ]
  })
}

// Starting points for the form, in the app's two languages. Picking one fills
// the task rows; the organizer can change everything after.
export const CLASS_PROJECT_PRESETS = {
  presentation: {
    ja: [
      { title: 'テーマと構成を決める', metric: 'status', unit: '', target: '', daysBefore: '42' },
      { title: '調査メモ', metric: 'characters', unit: '', target: '2000', daysBefore: '28' },
      { title: '発表原稿', metric: 'characters', unit: '', target: '3000', daysBefore: '10' },
      { title: '図表づくり', metric: 'count', unit: '枚', target: '6', daysBefore: '7' },
      { title: 'スライド', metric: 'count', unit: '枚', target: '15', daysBefore: '5' },
      { title: '参考文献リスト', metric: 'status', unit: '', target: '', daysBefore: '5' },
      { title: 'リハーサル', metric: 'status', unit: '', target: '', daysBefore: '2' },
    ],
    en: [
      { title: 'Choose the topic and outline', metric: 'status', unit: '', target: '', daysBefore: '42' },
      { title: 'Research notes', metric: 'characters', unit: '', target: '2000', daysBefore: '28' },
      { title: 'Talk script', metric: 'characters', unit: '', target: '3000', daysBefore: '10' },
      { title: 'Charts and figures', metric: 'count', unit: 'figures', target: '6', daysBefore: '7' },
      { title: 'Slides', metric: 'count', unit: 'slides', target: '15', daysBefore: '5' },
      { title: 'Reference list', metric: 'status', unit: '', target: '', daysBefore: '5' },
      { title: 'Rehearsal', metric: 'status', unit: '', target: '', daysBefore: '2' },
    ],
  },
  report: {
    ja: [
      { title: 'テーマを決める', metric: 'status', unit: '', target: '', daysBefore: '35' },
      { title: '調査メモ', metric: 'characters', unit: '', target: '2000', daysBefore: '21' },
      { title: '構成', metric: 'status', unit: '', target: '', daysBefore: '14' },
      { title: '本文', metric: 'characters', unit: '', target: '8000', daysBefore: '5' },
      { title: '推敲と提出準備', metric: 'status', unit: '', target: '', daysBefore: '1' },
    ],
    en: [
      { title: 'Choose the topic', metric: 'status', unit: '', target: '', daysBefore: '35' },
      { title: 'Research notes', metric: 'characters', unit: '', target: '2000', daysBefore: '21' },
      { title: 'Outline', metric: 'status', unit: '', target: '', daysBefore: '14' },
      { title: 'Body text', metric: 'characters', unit: '', target: '8000', daysBefore: '5' },
      { title: 'Revise and submit', metric: 'status', unit: '', target: '', daysBefore: '1' },
    ],
  },
} satisfies Record<string, Record<'ja' | 'en', ClassProjectTaskRow[]>>
