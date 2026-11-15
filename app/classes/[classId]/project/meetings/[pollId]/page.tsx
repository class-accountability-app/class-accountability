import Link from 'next/link'
import { primaryButtonClass } from '@/components/buttons'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, tokyoToday } from '@/lib/date'
import { availability, bestOption, pollSummary, rankOptions, tallyOptions, type PollAnswer } from '@/lib/meeting-poll'
import { latestCheckins, type CheckinRow } from '@/lib/project-board'
import { missingCheckins, roundStartFor } from '@/lib/checkin'
import { StatusStamp } from '@/components/status-stamp'
import { STATUS_PILL_CLASS, loadMyPodProject, taskValueText } from '../../load'
import { chosenStart, formatMeeting, formatSlot, loadPolls } from '../load'
import { googleCalendarUrl } from '@/lib/calendar'
import { appOrigin } from '@/lib/app-origin'
import { CancelPoll, ConfirmPoll, VoteGrid } from './poll-controls'
import { MeetingNotes } from '@/components/project/meeting-notes'
import { QuickTaskForm } from '@/components/project/quick-task-form'

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
  // Not a uuid, or not one of my pod's polls (RLS returns nothing): 404.
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) notFound()
  // The page is about one poll, so it shows that poll's project, whichever
  // project the board is on (a team can have several).
  const { data: pollProject } = await supabase.from('meeting_polls').select('project_id').eq('id', pollId).maybeSingle()
  const pod = await loadMyPodProject(supabase, classId, user.id, tCommon('unknownPerson'), pollProject?.project_id)
  if (!pod?.project) redirect(`/classes/${classId}/project`)
  const { project, members } = pod

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
        className="-ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-container"
      >
        {t('back')}
      </Link>
      <h1 className="font-heading text-[28px] leading-tight font-bold text-ink [overflow-wrap:anywhere] lg:text-[36px]">{poll.title}</h1>
      <p className="pt-1 font-meta text-[13px] leading-7 text-muted">{meta}</p>
    </div>
  )
  const wrap = (children: React.ReactNode) => (
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">{children}</div>
    </div>
  )

  if (poll.status === 'cancelled') {
    return wrap(
      <>
        {header(t('poll.minutes', { count: poll.durationMinutes }))}
        <p className="rule-card px-5 py-5 text-sm leading-7 text-muted">{t('vote.cancelled')}</p>
      </>
    )
  }

  if (poll.status === 'confirmed') {
    const start = chosenStart(poll)!
    const [{ data: checkinRows }, { data: note, error: noteError }, tPlanning] = await Promise.all([
      supabase
        .from('project_checkins')
        .select('user_id, round_start, created_at, snapshot, note')
        .eq('project_id', project.id),
      // 0038: the meeting's shared note (errors before that migration: hidden).
      supabase
        .from('meeting_notes')
        .select('body, updated_by, updated_at')
        .eq('poll_id', poll.id)
        .maybeSingle<{ body: string; updated_by: string | null; updated_at: string }>(),
      getTranslations('planning'),
    ])
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
        <div className="-mt-3.5 flex flex-wrap gap-3 px-0.5">
          <a
            href={googleCalendarUrl({
              kind: 'meeting',
              title: poll.title,
              start: new Date(start),
              minutes: poll.durationMinutes,
              url: `${await appOrigin()}/classes/${classId}/project/meetings/${poll.id}`,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-surface-container"
          >
            {t('meeting.googleCalendar')}
          </a>
          <a
            href={`/classes/${classId}/project/meetings/${poll.id}/calendar`}
            className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-surface-container"
          >
            {t('meeting.icsFile')}
          </a>
        </div>
        <section aria-labelledby="agenda-heading" className="rule-card flex flex-col gap-1 px-5 py-5">
          <h2 id="agenda-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
            {t('meeting.agenda')}
          </h2>
          {members.map((m) => {
            const checkin = latest.get(m.id)
            const items = checkin ? [...checkin.items.values()] : []
            return (
              <div key={m.id} className="flex flex-col border-b border-dashed border-ink/15 py-2 last:border-b-0">
                <div className="flex min-h-7 items-center gap-2.5">
                  <StatusStamp status={checkin ? 'active' : 'stale'} />
                  <h3 className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{displayName(m.id)}</h3>
                </div>
                {!checkin ? (
                  <p className="text-[13px] leading-7 text-muted">{t('noCheckin')}</p>
                ) : items.length === 0 ? (
                  <p className="text-[13px] leading-7 text-muted">{t('feed.noItems')}</p>
                ) : (
                  <ul className="flex flex-col">
                    {items.map((item) => (
                      <li key={item.taskId} className="flex min-h-9 items-center justify-between gap-2.5 py-0.5">
                        <span className="min-w-0 text-[13px] leading-6 text-ink [overflow-wrap:anywhere]">
                          {item.title}
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
              </div>
            )
          })}
        </section>
        {waiting.length > 0 && (
          <div className="rule-card tint-hudson flex flex-col gap-3.5 px-5 py-5">
            <p className="text-sm leading-7 text-ink">
              {t('meeting.waiting', { names: waiting.map(displayName).join(tCommon('listSeparator')) })}
            </p>
            {waiting.includes(user.id) && (
              <Link href={`/classes/${classId}/project/checkin`} className={`${primaryButtonClass} self-start`}>
                {t('meeting.checkinFirst')}
              </Link>
            )}
          </div>
        )}
        {!noteError && (
          <MeetingNotes
            classId={classId}
            pollId={poll.id}
            initial={note?.body ?? ''}
            updatedLine={
              note
                ? tPlanning('notesUpdated', {
                    name: note.updated_by ? displayName(note.updated_by) : tCommon('unknownPerson'),
                    when: formatDateTime(note.updated_at, locale),
                  })
                : null
            }
          />
        )}
        <QuickTaskForm classId={classId} projectId={project.id} members={members.map((m) => ({ id: m.id, name: displayName(m.id) }))} />
        <CancelPoll classId={classId} pollId={poll.id} label={t('meeting.cancel')} />
      </>
    )
  }

  // Open: answer, see the counts, pick a time.
  const tallies = tallyOptions(poll.options, poll.votes, memberIds)
  const best = bestOption(poll.options, tallies)
  const mine: Record<string, PollAnswer> = {}
  for (const v of poll.votes) if (v.userId === user.id) mine[v.optionId] = v.answer
  // Who can make each time (2026-11-15): names, a summary on top, a table on
  // wide screens. The team already reads every answer (0024).
  const who = availability(poll.options, poll.votes, memberIds)
  const whoOf = new Map(who.map((w) => [w.optionId, w]))
  const names = (ids: string[]) => ids.map(displayName).join(tCommon('listSeparator'))
  const rows = poll.options.map((o) => {
    const tally = tallies.find((x) => x.optionId === o.id)!
    const w = whoOf.get(o.id)!
    return {
      id: o.id,
      label: formatSlot(o.startsAt, locale),
      tally: t('vote.tally', { yes: tally.yes, maybe: tally.maybe, no: tally.no }),
      best: o.id === best,
      everyone: w.everyone,
      yes: names(w.yes),
      maybe: names(w.maybe),
      no: names(w.no),
      unanswered: names(w.unanswered),
      counts: { yes: w.yes.length, maybe: w.maybe.length, no: w.no.length, unanswered: w.unanswered.length },
    }
  })
  const labelOf = new Map(rows.map((r) => [r.id, r.label]))
  const summary = pollSummary(who)
  const costOf = (optionId: string) => {
    const w = whoOf.get(optionId)!
    if (w.everyone) return t('vote.confirmEveryone')
    const parts = [
      w.no.length > 0 ? t('vote.confirmNo', { names: names(w.no) }) : null,
      w.maybe.length > 0 ? t('vote.confirmMaybe', { names: names(w.maybe) }) : null,
      w.unanswered.length > 0 ? t('vote.confirmUnanswered', { names: names(w.unanswered) }) : null,
    ].filter((x): x is string => x !== null)
    return parts.join(' ')
  }
  const answerOf = new Map(poll.votes.map((v) => [`${v.optionId}:${v.userId}`, v.answer]))
  const MARK: Record<PollAnswer, string> = { yes: '○', maybe: '△', no: '✕' }
  const notYet = memberIds.filter((id) => !poll.votes.some((v) => v.userId === id))

  return wrap(
    <>
      {header(
        `${t('poll.minutes', { count: poll.durationMinutes })} · ${t('meetings.answered', { answered, total: members.length })}` +
          (poll.voteBy ? ` · ${t('vote.by', { when: formatSlot(poll.voteBy, locale) })}` : '')
      )}
      <p className="-mb-3.5 px-0.5 text-[13px] leading-7 text-muted">{t('vote.legend')}</p>
      <section
        aria-labelledby="poll-summary"
        className={`rule-card flex flex-col gap-1 px-5 py-4 ${summary.kind === 'everyone' ? 'tint-olive' : ''}`}
      >
        <h2 id="poll-summary" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {summary.kind === 'everyone'
            ? t('vote.summaryEveryone', { when: labelOf.get(summary.optionId) ?? '' })
            : summary.kind === 'best'
              ? t('vote.summaryBest', { when: labelOf.get(summary.optionId) ?? '', yes: summary.yes, total: members.length })
              : t('vote.summaryNone')}
        </h2>
        {summary.kind === 'everyone' && summary.more > 0 && (
          <p className="text-sm leading-7 text-ink">{t('vote.summaryMore', { count: summary.more })}</p>
        )}
        {summary.kind === 'best' && summary.cannot.length > 0 && (
          <p className="text-sm leading-7 text-ink [overflow-wrap:anywhere]">{t('vote.confirmNo', { names: names(summary.cannot) })}</p>
        )}
        {summary.kind === 'best' && summary.unanswered.length > 0 && (
          <p className="text-sm leading-7 text-ink [overflow-wrap:anywhere]">
            {t('vote.confirmUnanswered', { names: names(summary.unanswered) })}
          </p>
        )}
      </section>
      <VoteGrid classId={classId} pollId={poll.id} rows={rows} rankedIds={rankOptions(who).map((w) => w.optionId)} mine={mine} />
      {/* Wide screens: the whole picture, times down and people across. */}
      <section aria-labelledby="poll-table" className="rule-card hidden flex-col gap-2 px-5 py-5 md:flex">
        <h2 id="poll-table" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t('vote.tableHeading')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="py-1.5 pr-3 font-semibold">{t('vote.tableTime')}</th>
                {members.map((m) => (
                  <th key={m.id} scope="col" className="px-2 py-1.5 text-center font-semibold [overflow-wrap:anywhere]">
                    {displayName(m.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-dashed border-ink/15 ${r.everyone ? 'bg-tint-olive' : ''}`}>
                  <th scope="row" className="py-2 pr-3 font-semibold whitespace-nowrap text-ink">
                    {r.label}
                    {r.everyone && <span className="font-meta text-xs font-bold"> · {t('vote.everyone')}</span>}
                  </th>
                  {members.map((m) => {
                    const answer = answerOf.get(`${r.id}:${m.id}`)
                    return (
                      <td key={m.id} className="px-2 py-2 text-center text-[17px] font-bold text-ink">
                        <span aria-hidden>{answer ? MARK[answer] : '–'}</span>
                        <span className="sr-only">{answer ? t(`vote.answers.${answer}`) : t('vote.notAnswered')}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {notYet.length > 0 && (
        <p className="rule-card tint-hudson px-5 py-4 text-sm leading-7 text-ink">
          {t('vote.notYet', { names: notYet.map(displayName).join(tCommon('listSeparator')) })}
        </p>
      )}
      <ConfirmPoll
        classId={classId}
        pollId={poll.id}
        options={rows.map((r) => ({ id: r.id, label: r.label, cost: costOf(r.id), everyone: r.everyone }))}
        defaultOptionId={best}
      />
      <CancelPoll classId={classId} pollId={poll.id} label={t('vote.cancel')} />
    </>
  )
}
