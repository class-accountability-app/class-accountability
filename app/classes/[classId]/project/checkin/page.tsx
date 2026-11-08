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
    // Soft pastel (2026-11-06, phone screen G): a light 「今回の」 over a bold
    // title, one line on who sees what, my numbers on Penna, the note in a
    // white card, and a done round on olive.
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="px-0.5">
          <Link href={backHref} className="-ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-container">
            {t('back')}
          </Link>
          <p className="font-meta text-[13px] leading-7 text-muted">{t('checkin.forRound', { date: formatDate(round.dueOn, locale) })}</p>
          <h1 className="font-heading text-[28px] leading-tight font-light text-ink lg:text-[36px]">
            {t('checkin.titleKicker')}
            <br />
            <span className="font-bold">{t('checkin.title')}</span>
          </h1>
          <p className="pt-2 text-sm leading-7 text-muted">{t('checkin.intro')}</p>
        </div>

        {round.submitted ? (
          <div role="status" className="rule-card flex flex-col bg-tint-olive px-5 py-5 shadow-none">
            <p className="text-[15px] leading-7 font-semibold text-ink">✓ {t('checkin.done', { date: formatDate(round.nextRoundStart, locale) })}</p>
            <div className="pt-3.5">
              <Link href={`/classes/${classId}/project/checkins`} className={secondaryButtonClass}>
                {t('checkin.feed')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <section aria-labelledby="preview-heading" className="rule-card tint-penna flex flex-col gap-1 px-5 py-5">
              <h2 id="preview-heading" className="flex items-center gap-2.5 font-heading text-[17px] leading-7 font-bold text-ink">
                <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink font-meta text-[13px] text-page-bg">
                  1
                </span>
                {t('checkin.preview')}
              </h2>
              {tasks.length === 0 ? (
                <p className="text-sm leading-7 text-ink">{t('checkin.noTasks')}</p>
              ) : (
                <ul className="flex flex-col">
                  {tasks.map((x) => {
                    const task = { metric: x.metric, unit: x.unit, targetAmount: x.target_amount === null ? null : Number(x.target_amount) }
                    const total = x.metric === 'status' ? null : (totals.get(x.id) ?? 0)
                    const value = taskValueText(t, number, task, total)
                    return (
                      <li key={x.id} className="flex flex-col border-b border-dashed border-ink/15 py-2 last:border-b-0">
                        <div className="flex min-h-7 items-center justify-between gap-2.5">
                          <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{x.title}</span>
                          <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[x.status]}`}>
                            {t(`status.${x.status}`)}
                          </span>
                        </div>
                        {value && <p className="text-[13px] leading-7 text-ink">{value}</p>}
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
            <div className="rule-card px-5 py-5">
              <CheckinForm classId={classId} projectId={project.id} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
