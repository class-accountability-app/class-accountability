import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { formatDate, formatTimeAgo } from '@/lib/date'
import { isOverdue } from '@/lib/project-stats'
import { ProgressBar } from '@/components/progress-bar'
import { primaryButtonClass } from '@/components/buttons'
import { OpenSourceButton } from '@/components/project/open-source-button'
import { STATUS_PILL_CLASS } from '../load'
import { ClaimButton, TaskStatusControl, WriteInAppButton } from '../task-controls'
import { TaskLog } from '../task-log'
import type { BoardTask, SourceRow } from './types'

// One task on the board, inside its owner's card. What shows depends on whose
// it is: mine gets the status control, my Google file (open, change, relink),
// 書く or ＋記録; a teammate's shows its status and number only (plus the group
// Doc's open button, which the team shares); a task nobody has gets 担当する.
export async function BoardTaskRow({
  classId,
  userId,
  task,
  value,
  mine,
  unassigned,
  source,
  lastChecked,
  waitingTitles,
  locale,
  now,
}: {
  classId: string
  userId: string
  task: BoardTask
  // The task's number as text ("1,200 / 3,000字"), null for a status-only task.
  value: string | null
  mine: boolean
  unassigned: boolean
  source: SourceRow | undefined
  // When my linked file was last read; undefined for a task that isn't mine.
  lastChecked: string | null | undefined
  // Titles of the unfinished tasks this one waits for (0038).
  waitingTitles: string[]
  locale: Locale
  now: Date
}) {
  const [t, tGoogle, tPlanning, tCommon] = await Promise.all([
    getTranslations('project'),
    getTranslations('google'),
    getTranslations('planning'),
    getTranslations('common'),
  ])
  const overdue = isOverdue(task, now)
  const boardPath = `/classes/${classId}/project`
  const linkHref = `${boardPath}/tasks/${task.id}/link`

  return (
    <li className="flex flex-col border-b border-dashed border-border py-0 last:border-b-0">
      <div className="flex min-h-7 items-center justify-between gap-2.5">
        <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</span>
        {mine ? (
          <TaskStatusControl classId={classId} taskId={task.id} status={task.status} />
        ) : (
          <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[task.status]}`}>
            {t(`status.${task.status}`)}
          </span>
        )}
      </div>
      {value && <p className="text-[13px] leading-7 text-muted">{value}</p>}
      {waitingTitles.length > 0 && (
        <p className="text-[13px] leading-7 text-muted [overflow-wrap:anywhere]">
          {tPlanning('waitingOn', { titles: waitingTitles.join(tCommon('listSeparator')) })}
        </p>
      )}
      {value && task.targetAmount !== null && (
        <div className="flex h-7 items-center">
          <ProgressBar value={task.shown.total ?? 0} max={task.targetAmount} valueText={value} />
        </div>
      )}
      {task.due && (
        <p className={`font-meta text-xs leading-7 ${overdue ? 'font-bold text-ink' : 'text-muted'}`}>
          {overdue ? t('overdueTask') : t('dueTask', { date: formatDate(task.due, locale) })}
        </p>
      )}

      {/* My Google file: when it was last read, or that it can't be read. */}
      {mine && source && (
        <div className="flex flex-wrap items-center gap-x-3">
          <p className={`font-meta text-xs leading-7 ${source.state === 'ok' ? 'text-status-active' : 'text-accent-text'}`}>
            {source.state === 'ok'
              ? lastChecked
                ? tGoogle('updated', { when: formatTimeAgo(lastChecked, locale, now) })
                : tGoogle('notYet')
              : `${tGoogle('fileName', { name: source.label ?? tGoogle(`kind.${source.kind}`) })} · ${tGoogle('lost')}`}
          </p>
          {source.state !== 'ok' && (
            <Link href={linkHref} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-text underline underline-offset-4">
              {tGoogle('relink')}
            </Link>
          )}
        </div>
      )}
      {mine && source?.state === 'ok' && (
        <div className="pb-2">
          <OpenSourceButton kind={source.kind} fileId={source.file_id} label={source.label} changeHref={linkHref} small />
        </div>
      )}
      {!mine && source?.kind === 'doc_section' && (
        <>
          <p className="font-meta text-xs leading-7 text-muted">{tGoogle('teammateLinked')}</p>
          <div className="pb-2">
            <OpenSourceButton kind="doc_section" fileId={source.file_id} label={source.label} small />
          </div>
        </>
      )}

      {mine && task.inputMode === 'document' && (
        <div className="pb-3.5">
          <Link href={`${boardPath}/tasks/${task.id}/write`} className={primaryButtonClass}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
            {t('keepWriting')}
          </Link>
        </div>
      )}
      {mine && task.inputMode === 'manual' && !source && task.metric !== 'status' && task.status !== 'done' && (
        <>
          {/* Writing in the app first: it counts itself, nothing to log by hand. */}
          {task.metric === 'characters' && (task.shown.total ?? 0) === 0 && (
            <div className="pt-1 pb-2">
              <WriteInAppButton classId={classId} taskId={task.id} />
            </div>
          )}
          <TaskLog classId={classId} taskId={task.id} userId={userId} title={task.title} metric={task.metric} unit={task.unit} />
          <Link href={linkHref} className="-mt-2 inline-flex min-h-11 items-center self-start pb-1 text-[13px] font-semibold text-accent-text underline underline-offset-4">
            {tGoogle(task.metric === 'characters' ? 'makeOrLinkDoc' : 'makeOrLinkFile')}
          </Link>
        </>
      )}
      {unassigned && (
        <div className="pb-3.5">
          <ClaimButton classId={classId} taskId={task.id} />
        </div>
      )}
    </li>
  )
}
