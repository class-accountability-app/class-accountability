import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { addDaysYmd, formatDate, tokyoToday } from '@/lib/date'
import { missingCheckins, previousRoundStart, roundStartFor } from '@/lib/checkin'
import { snapshotItems } from '@/lib/project-board'
import { StatusStamp } from '@/components/status-stamp'
import { STATUS_PILL_CLASS, loadMyPodProject, taskValueText } from '../load'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'

// The check-in feed (mockup view "feed"): one round's shares, who hasn't
// shared yet, and a link to the round before. Check-ins are the pod's to read
// (0022); each card shows only what its member shared.
export default async function CheckinFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ round?: string }>
}) {
  const [{ classId }, { round: which }] = await Promise.all([params, searchParams])
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
  const { project, members } = pod

  const now = new Date()
  const every = project.checkin_every_days
  const current = roundStartFor(project.start_date, every, tokyoToday(now))
  const previous = previousRoundStart(project.start_date, every, now)
  const showPrevious = which === 'previous' && previous !== null
  const roundStart = showPrevious ? previous : current

  const { data: rows } = await supabase
    .from('project_checkins')
    .select('user_id, round_start, note, snapshot, created_at')
    .eq('project_id', project.id)
    .eq('round_start', roundStart)
  const checkins = rows ?? []

  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const memberIds = members.map((m) => m.id)
  // Members in pod order; someone who left still shows if they shared.
  const shared = [...checkins].sort(
    (a, b) => (memberIds.indexOf(a.user_id) + 1 || 99) - (memberIds.indexOf(b.user_id) + 1 || 99)
  )
  const waiting = missingCheckins(
    memberIds,
    checkins.map((c) => ({ userId: c.user_id, roundStart: c.round_start })),
    roundStart
  )
  const number = new Intl.NumberFormat(locale)
  const base = `/classes/${classId}/project/checkins`

  return (
    // Soft pastel (2026-11-08): one card per share (mine on Penna, my own
    // work), each task as a line with its status pill, and who hasn't shared
    // yet on Hudson (needs attention).
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 md:max-w-xl">
        <Link
          href={`/classes/${classId}/project`}
          className="-ml-2 inline-flex min-h-11 items-center self-start rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-container"
        >
          {t('back')}
        </Link>
        <div className="px-0.5">
          <h1 className="font-heading text-[28px] leading-tight font-bold text-ink [overflow-wrap:anywhere] lg:text-[36px]">
            {t('feed.title', { date: formatDate(addDaysYmd(roundStart, every - 1), locale) })}
          </h1>
          <p className="font-meta text-[13px] leading-7 text-muted">
            {t('feed.sub', { shared: shared.length, total: members.length })}
          </p>
        </div>

        {shared.length === 0 && <p className="rule-card px-5 py-5 text-sm leading-7 text-muted">{t('feed.none')}</p>}

        {shared.map((c) => {
          const items = snapshotItems(c.snapshot)
          const name = c.user_id === user.id ? t('you', { name: nameOf.get(user.id) ?? '' }) : (nameOf.get(c.user_id) ?? tCommon('unknownPerson'))
          return (
            <article key={c.user_id} className={`rule-card flex flex-col gap-2 px-5 py-5 ${c.user_id === user.id ? 'tint-penna' : ''}`}>
              <div className="flex min-h-7 items-center gap-2.5">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-heading text-sm font-bold text-page-bg">
                  {[...name][0] ?? '?'}
                </span>
                <h2 className="flex-1 text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{name}</h2>
                <StatusStamp status="active" />
              </div>
              {c.note && (
                <p className="rounded-2xl bg-surface px-4 py-3 text-[15px] leading-7 whitespace-pre-line text-ink shadow-[inset_0_0_0_1px_var(--border)] [overflow-wrap:anywhere]">
                  {c.note}
                </p>
              )}
              {items.length === 0 ? (
                <p className="text-[13px] leading-7 text-muted">{t('feed.noItems')}</p>
              ) : (
                <ul className="flex flex-col">
                  {items.map((item) => (
                    <li key={item.taskId} className="flex min-h-9 items-center justify-between gap-2.5 border-b border-dashed border-ink/15 py-1 last:border-b-0">
                      <span className="min-w-0 text-[13px] leading-6 text-ink [overflow-wrap:anywhere]">
                        <span className="font-semibold">{item.title}</span>
                        {taskValueText(t, number, item, item.total) && (
                          <span className="font-meta text-muted"> · {taskValueText(t, number, item, item.total)}</span>
                        )}
                      </span>
                      <span className={`shrink-0 rounded-lg px-2 font-meta text-xs leading-5 font-bold ${STATUS_PILL_CLASS[item.status]}`}>
                        {t(`status.${item.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}

        {waiting.length > 0 && (
          <div className="rule-card tint-hudson flex flex-col gap-3.5 px-5 py-5">
            <p className="text-sm leading-7 text-ink">
              {t('feed.waiting', {
                names: waiting.map((id) => (id === user.id ? t('you', { name: nameOf.get(id) ?? '' }) : nameOf.get(id))).join(tCommon('listSeparator')),
              })}
            </p>
            {!showPrevious && waiting.includes(user.id) ? (
              <Link href={`/classes/${classId}/project/checkin`} className={`${primaryButtonClass} self-start`}>
                {t('checkin.submit')}
              </Link>
            ) : (
              <Link href={`/classes/${classId}/project`} className={`${secondaryButtonClass} self-start`}>
                {t('feed.nudge')}
              </Link>
            )}
          </div>
        )}

        {previous !== null && (
          <div>
            <Link href={showPrevious ? base : `${base}?round=previous`} className={`${secondaryButtonClass} w-full`}>
              {showPrevious ? t('feed.current') : t('feed.previous')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
