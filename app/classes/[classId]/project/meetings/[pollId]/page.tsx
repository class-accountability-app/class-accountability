import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { tokyoToday } from '@/lib/date'
import { bestOption, tallyOptions, type PollAnswer } from '@/lib/meeting-poll'
import { latestCheckins, type CheckinRow } from '@/lib/project-board'
import { missingCheckins, roundStartFor } from '@/lib/checkin'
import { StatusStamp } from '@/components/status-stamp'
import { loadMyPodProject, taskValueText } from '../../load'
import { chosenStart, formatMeeting, formatSlot, loadPolls } from '../load'
import { CancelPoll, ConfirmPoll, VoteGrid } from './poll-controls'

// One poll. Open: the vote grid (mockup "vote") and 〜にきめる. Confirmed: the
// meeting (mockup "meeting") with each member's latest check-in as the agenda.
export default async function PollPage({ params }: { params: Promise<{ classId: string; pollId: string }> }) {
  const { classId, pollId } = await params
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

  // Not a uuid, or not one of my pod's polls (RLS returns nothing): 404.
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) notFound()
  const [poll] = await loadPolls(supabase, project.id, pollId)
  if (!poll) notFound()

  const memberIds = members.map((m) => m.id)
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const displayName = (id: string) => (id === user.id ? t('you', { name: nameOf.get(id) ?? '' }) : (nameOf.get(id) ?? tCommon('unknownPerson')))
  const answered = new Set(poll.votes.filter((v) => memberIds.includes(v.userId)).map((v) => v.userId)).size
  const header = (meta: string) => (
    <div className="px-0.5">
      <Link
        href={`/classes/${classId}/project/meetings`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text"
      >
        {t('back')}
      </Link>
      <h1 className="font-heading text-[26px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">{poll.title}</h1>
      <p className="font-meta text-xs leading-7 text-muted">{meta}</p>
    </div>
  )
  const wrap = (children: React.ReactNode) => (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">{children}</div>
    </div>
  )

  if (poll.status === 'cancelled') {
    return wrap(
      <>
        {header(t('poll.minutes', { count: poll.durationMinutes }))}
        <p className="px-0.5 text-sm leading-7 text-muted">{t('vote.cancelled')}</p>
      </>
    )
  }

  if (poll.status === 'confirmed') {
    const start = chosenStart(poll)!
    const { data: checkinRows } = await supabase
      .from('project_checkins')
      .select('user_id, round_start, created_at, snapshot, note')
      .eq('project_id', project.id)
    const rows = checkinRows ?? []
    const latest = latestCheckins(
      rows.map((r): CheckinRow => ({ userId: r.user_id, roundStart: r.round_start, createdAt: r.created_at, snapshot: r.snapshot }))
    )
    const round = roundStartFor(project.start_date, project.checkin_every_days, tokyoToday())
    const waiting = missingCheckins(memberIds, rows.map((r) => ({ userId: r.user_id, roundStart: r.round_start })), round)
    const number = new Intl.NumberFormat(locale)

    return wrap(
      <>
        {header(formatMeeting(start, poll.durationMinutes, locale))}
        <section aria-labelledby="agenda-heading" className="rule-card flex flex-col px-3.5 py-3.5">
          <h2 id="agenda-heading" className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">
            {t('meeting.agenda')}
          </h2>
          {members.map((m) => {
            const checkin = latest.get(m.id)
            const items = checkin ? [...checkin.items.values()] : []
            return (
              <div key={m.id} className="flex flex-col border-b border-dashed border-border last:border-b-0">
                <div className="flex min-h-7 items-center gap-2.5">
                  <StatusStamp status={checkin ? 'active' : 'stale'} />
                  <h3 className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{displayName(m.id)}</h3>
                </div>
                {!checkin ? (
                  <p className="text-[13px] leading-7 text-muted">{t('noCheckin')}</p>
                ) : items.length === 0 ? (
                  <p className="text-[13px] leading-7 text-muted">{t('feed.noItems')}</p>
                ) : (
                  <ul>
                    {items.map((item) => (
                      <li key={item.taskId} className="text-[13px] leading-7 text-muted [overflow-wrap:anywhere]">
                        • {item.title}　{taskValueText(t, number, item, item.total) ?? t(`status.${item.status}`)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          {waiting.length > 0 && (
            <p className="text-[13px] leading-7 text-muted">
              {t('meeting.waiting', { names: waiting.map(displayName).join(tCommon('listSeparator')) })}
            </p>
          )}
        </section>
        {waiting.includes(user.id) && (
          <Link
            href={`/classes/${classId}/project/checkin`}
            className="inline-flex min-h-11 items-center self-start px-0.5 text-sm font-semibold text-accent-text underline underline-offset-4"
          >
            {t('meeting.checkinFirst')}
          </Link>
        )}
        <CancelPoll classId={classId} pollId={poll.id} label={t('meeting.cancel')} />
      </>
    )
  }

  // Open: answer, see the counts, pick a time.
  const tallies = tallyOptions(poll.options, poll.votes, memberIds)
  const best = bestOption(poll.options, tallies)
  const mine: Record<string, PollAnswer> = {}
  for (const v of poll.votes) if (v.userId === user.id) mine[v.optionId] = v.answer
  const rows = poll.options.map((o) => {
    const tally = tallies.find((x) => x.optionId === o.id)!
    return {
      id: o.id,
      label: formatSlot(o.startsAt, locale),
      tally: t('vote.tally', { yes: tally.yes, maybe: tally.maybe, no: tally.no }),
      best: o.id === best,
    }
  })
  const notYet = memberIds.filter((id) => !poll.votes.some((v) => v.userId === id))

  return wrap(
    <>
      {header(
        `${t('poll.minutes', { count: poll.durationMinutes })} · ${t('meetings.answered', { answered, total: members.length })}` +
          (poll.voteBy ? ` · ${t('vote.by', { when: formatSlot(poll.voteBy, locale) })}` : '')
      )}
      <p className="-mb-3.5 px-0.5 text-[13px] leading-7 text-muted">{t('vote.legend')}</p>
      <VoteGrid classId={classId} pollId={poll.id} rows={rows} mine={mine} />
      {notYet.length > 0 && (
        <p className="px-0.5 text-[13px] leading-7 text-muted">
          {t('vote.notYet', { names: notYet.map(displayName).join(tCommon('listSeparator')) })}
        </p>
      )}
      <ConfirmPoll
        classId={classId}
        pollId={poll.id}
        options={rows.map((r) => ({ id: r.id, label: r.label }))}
        defaultOptionId={best}
      />
      <CancelPoll classId={classId} pollId={poll.id} label={t('vote.cancel')} />
    </>
  )
}
