import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { addDaysYmd, formatDate, tokyoToday } from '@/lib/date'
import { missingCheckins, previousRoundStart, roundStartFor } from '@/lib/checkin'
import { snapshotItems } from '@/lib/project-board'
import { StatusStamp } from '@/components/status-stamp'
import { loadMyPodProject, taskValueText } from '../load'

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
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="px-0.5">
          <Link
            href={`/classes/${classId}/project`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text"
          >
            {t('back')}
          </Link>
          <h1 className="font-heading text-[26px] leading-7 font-bold text-ink">
            {t('feed.title', { date: formatDate(addDaysYmd(roundStart, every - 1), locale) })}
          </h1>
          <p className="font-meta text-xs leading-7 text-muted">
            {t('feed.sub', { shared: shared.length, total: members.length })}
          </p>
        </div>

        {shared.length === 0 && <p className="px-0.5 text-sm leading-7 text-muted">{t('feed.none')}</p>}

        {shared.map((c) => {
          const items = snapshotItems(c.snapshot)
          const name = c.user_id === user.id ? t('you', { name: nameOf.get(user.id) ?? '' }) : (nameOf.get(c.user_id) ?? tCommon('unknownPerson'))
          return (
            <article key={c.user_id} className="rule-card flex flex-col px-3.5 py-3.5">
              <div className="flex min-h-7 items-center gap-2.5">
                <StatusStamp status="active" />
                <h2 className="flex-1 text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{name}</h2>
              </div>
              {c.note && <p className="text-[15px] leading-7 text-ink [overflow-wrap:anywhere]">“{c.note}”</p>}
              {items.length === 0 ? (
                <p className="text-[13px] leading-7 text-muted">{t('feed.noItems')}</p>
              ) : (
                <ul className="flex flex-col">
                  {items.map((item) => (
                    <li key={item.taskId} className="text-[13px] leading-7 text-muted [overflow-wrap:anywhere]">
                      • {item.title}　{taskValueText(t, number, item, item.total) ?? t(`status.${item.status}`)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}

        {waiting.length > 0 && (
          <div className="rule-card flex flex-col px-3.5 py-3.5">
            <p className="text-[13px] leading-7 text-muted">
              {t('feed.waiting', {
                names: waiting.map((id) => (id === user.id ? t('you', { name: nameOf.get(id) ?? '' }) : nameOf.get(id))).join(tCommon('listSeparator')),
              })}
            </p>
            {!showPrevious && waiting.includes(user.id) ? (
              <Link
                href={`/classes/${classId}/project/checkin`}
                className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4"
              >
                {t('checkin.submit')}
              </Link>
            ) : (
              <Link
                href={`/classes/${classId}/progress`}
                className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4"
              >
                {t('feed.nudge')}
              </Link>
            )}
          </div>
        )}

        {previous !== null && (
          <div className="px-0.5">
            <Link
              href={showPrevious ? base : `${base}?round=previous`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
            >
              {showPrevious ? t('feed.current') : t('feed.previous')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
