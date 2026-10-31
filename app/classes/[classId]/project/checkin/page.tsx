import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/date'
import { checkinStatus } from '@/lib/checkin'
import { ProgressBar } from '@/components/progress-bar'
import { secondaryButtonClass } from '@/components/buttons'
import { STATUS_PILL_CLASS, loadMyLiveTotals, loadMyPodProject, taskValueText, type TaskRow } from '../load'
import { CheckinForm } from './checkin-form'

// チェックイン (mockup view "checkin"): what my share will say, then a note.
// The preview is my tasks with my live numbers; submit_checkin builds the
// real snapshot from the same rows in the database.
export default async function CheckinPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tCommon, locale] = await Promise.all([
    getTranslations('project'),
    getTranslations('common'),
    getLocale() as Promise<Locale>,
  ])
  const pod = await loadMyPodProject(supabase, classId, user.id, tCommon('unknownPerson'))
  if (!pod?.project) redirect(`/classes/${classId}/project`)
  const { project } = pod

  const [{ data: taskRows }, { data: myCheckins }] = await Promise.all([
    supabase
      .from('project_tasks')
      .select('id, title, owner_id, metric, unit, target_amount, status, due')
      .eq('project_id', project.id)
      .eq('owner_id', user.id)
      .order('position')
      .order('created_at'),
    supabase.from('project_checkins').select('round_start').eq('project_id', project.id).eq('user_id', user.id),
  ])
  const tasks = (taskRows as TaskRow[] | null) ?? []
  const totals = await loadMyLiveTotals(supabase, tasks, user.id)
  const round = checkinStatus(
    project.start_date,
    project.checkin_every_days,
    (myCheckins ?? []).map((c) => c.round_start),
    new Date()
  )
  const number = new Intl.NumberFormat(locale)
  const backHref = `/classes/${classId}/project`

  return (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="px-0.5">
          <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text">
            {t('back')}
          </Link>
          <h1 className="font-heading text-[26px] leading-7 font-bold text-ink">{t('checkin.title')}</h1>
          <p className="font-meta text-xs leading-7 text-muted">{t('checkin.forRound', { date: formatDate(round.dueOn, locale) })}</p>
        </div>

        {round.submitted ? (
          <div className="rule-card flex flex-col px-3.5 py-3.5">
            <p className="text-[15px] leading-7 text-ink">{t('checkin.done', { date: formatDate(round.nextRoundStart, locale) })}</p>
            <div className="pt-3.5">
              <Link href={`/classes/${classId}/project/checkins`} className={secondaryButtonClass}>
                {t('checkin.feed')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <section aria-labelledby="preview-heading" className="rule-card flex flex-col px-3.5 py-3.5">
              <h2 id="preview-heading" className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">
                {t('checkin.preview')}
              </h2>
              {tasks.length === 0 ? (
                <p className="text-[13px] leading-7 text-muted">{t('checkin.noTasks')}</p>
              ) : (
                <ul className="flex flex-col">
                  {tasks.map((x) => {
                    const task = { metric: x.metric, unit: x.unit, targetAmount: x.target_amount === null ? null : Number(x.target_amount) }
                    const total = x.metric === 'status' ? null : (totals.get(x.id) ?? 0)
                    const value = taskValueText(t, number, task, total)
                    return (
                      <li key={x.id} className="flex flex-col border-b border-dashed border-border last:border-b-0">
                        <div className="flex min-h-7 items-center justify-between gap-2.5">
                          <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{x.title}</span>
                          <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[x.status]}`}>
                            {t(`status.${x.status}`)}
                          </span>
                        </div>
                        {value && <p className="text-[13px] leading-7 text-muted">{value}</p>}
                        {value && task.targetAmount !== null && (
                          <div className="flex h-7 items-center">
                            <ProgressBar value={total ?? 0} max={task.targetAmount} valueText={value} />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
            <CheckinForm classId={classId} projectId={project.id} />
          </>
        )}
      </div>
    </div>
  )
}
