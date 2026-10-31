import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/date'
import { projectPercent, type TaskLike } from '@/lib/project-stats'
import { tidyTotal } from '@/lib/project-board'
import { ProgressBar } from '@/components/progress-bar'
import { taskValueText, type TaskRow } from '../../load'
import { CopyProjectButton } from './copy-button'

// まとめ (feature batch 1): a finished project as the team left it: who owned
// which task, the final numbers and how many times each member checked in.
// RLS shows it only to the team's current members; nothing new is stored.
export default async function ProjectWrapUp({ params }: { params: Promise<{ classId: string; projectId: string }> }) {
  const { classId, projectId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, title, start_date, deadline, finished_at, status, pairing_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.status !== 'done') notFound()

  const [{ data: taskRows }, { data: totalRows }, { data: memberRows }, { data: checkinRows }, t, tCommon, locale] =
    await Promise.all([
      supabase
        .from('project_tasks')
        .select('id, title, owner_id, metric, unit, target_amount, status, due, input_mode')
        .eq('project_id', projectId)
        .order('position')
        .order('created_at'),
      supabase.rpc('project_task_totals', { p_project: projectId }),
      supabase
        .from('pairing_members')
        .select('user_id, profiles(display_name)')
        .eq('pairing_id', project.pairing_id),
      supabase.from('project_checkins').select('user_id').eq('project_id', projectId),
      getTranslations('wrapUp'),
      getTranslations('common'),
      getLocale() as Promise<Locale>,
    ])
  const tProject = await getTranslations('project')
  const tasks = (taskRows as TaskRow[] | null) ?? []
  const totals = new Map(
    ((totalRows ?? []) as { task_id: string; total: number | string }[]).map((r) => [r.task_id, tidyTotal(Number(r.total))])
  )
  const names = new Map(
    (memberRows ?? []).map((m) => [
      m.user_id,
      (m.profiles as unknown as { display_name: string } | null)?.display_name ?? tCommon('unknownPerson'),
    ])
  )
  const like: TaskLike[] = tasks.map((x) => ({
    id: x.id,
    ownerId: x.owner_id,
    metric: x.metric,
    targetAmount: x.target_amount === null ? null : Number(x.target_amount),
    status: x.status,
    total: totals.get(x.id) ?? 0,
    due: x.due,
  }))
  const percent = projectPercent(like)
  const number = new Intl.NumberFormat(locale)
  const checkins = new Map<string, number>()
  for (const c of checkinRows ?? []) checkins.set(c.user_id, (checkins.get(c.user_id) ?? 0) + 1)

  return (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="px-0.5">
          <Link href={`/classes/${classId}/project`} className="inline-flex min-h-11 items-center text-sm text-accent-text underline underline-offset-4">
            {t('back')}
          </Link>
          <p className="font-meta text-[13px] leading-7 text-muted">{t('kicker')}</p>
          <h1 className="font-heading text-[26px] leading-8 font-bold text-ink [overflow-wrap:anywhere]">{project.title}</h1>
          <p className="font-meta text-xs leading-7 text-muted">
            {t('dates', { start: formatDate(project.start_date, locale), end: formatDate(project.finished_at, locale) })}
          </p>
          <div className="flex h-7 items-center">
            <ProgressBar value={percent} max={100} valueText={t('percent', { percent })} />
          </div>
          <p className="text-[13px] leading-7 text-muted">{t('percent', { percent })}</p>
        </div>

        <section aria-labelledby="wrap-tasks" className="rule-card flex flex-col px-3.5 py-3.5">
          <h2 id="wrap-tasks" className="font-heading text-[17px] leading-7 font-bold text-ink">
            {t('tasks')}
          </h2>
          <ul className="flex flex-col">
            {tasks.map((x, i) => {
              const value = taskValueText(tProject, number, { metric: x.metric, unit: x.unit, targetAmount: like[i].targetAmount }, like[i].total)
              return (
                <li key={x.id} className="flex flex-col border-b border-dashed border-border py-1.5 last:border-b-0">
                  <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{x.title}</span>
                  <span className="text-[13px] leading-6 text-muted">
                    {x.owner_id ? names.get(x.owner_id) ?? t('formerMember') : t('noOwner')}
                    {' · '}
                    {tProject(`status.${x.status}`)}
                    {value && ` · ${value}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="wrap-members" className="rule-card flex flex-col px-3.5 py-3.5">
          <h2 id="wrap-members" className="font-heading text-[17px] leading-7 font-bold text-ink">
            {t('members')}
          </h2>
          <ul className="flex flex-col">
            {[...names.entries()].map(([id, name]) => {
              const owned = tasks.filter((x) => x.owner_id === id)
              return (
                <li key={id} className="flex items-center justify-between gap-2 border-b border-dashed border-border py-1.5 last:border-b-0">
                  <span className="text-[15px] leading-7 text-ink [overflow-wrap:anywhere]">{name}</span>
                  <span className="shrink-0 font-meta text-xs text-muted">
                    {t('memberLine', {
                      done: owned.filter((x) => x.status === 'done').length,
                      total: owned.length,
                      checkins: checkins.get(id) ?? 0,
                    })}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <CopyProjectButton classId={classId} projectId={project.id} />
      </div>
    </div>
  )
}
