import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { formatDate, formatDateWithWeekday } from '@/lib/date'
import type { checkinStatus } from '@/lib/checkin'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'

// 次のチェックイン and 次の打ち合わせ. The board shows them twice: above the
// tasks on phones and in the right-hand column from 1024px, so `where` keeps
// the two copies' heading ids apart.
export async function PlanCards({
  classId,
  where,
  round,
  nextMeeting,
  openPoll,
  locale,
}: {
  classId: string
  where: 'top' | 'side'
  // When my share for this round is due (lib/checkin.ts).
  round: ReturnType<typeof checkinStatus>
  // The nearest confirmed meeting, with its time already as text.
  nextMeeting: { id: string; title: string; when: string } | null
  // A poll still being answered, shown when no meeting is set.
  openPoll: { id: string; title: string } | null
  locale: Locale
}) {
  const t = await getTranslations('project')
  const meetingsHref = `/classes/${classId}/project/meetings`
  return (
    <>
      <section aria-labelledby={`checkin-heading-${where}`} className="rule-card flex flex-col px-5 py-5">
        <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('checkin.kicker')}</p>
        <h2 id={`checkin-heading-${where}`} className="font-heading text-[17px] leading-7 font-bold text-ink">
          {formatDateWithWeekday(round.dueOn, locale)}
        </h2>
        <p className="text-[13px] leading-7 text-muted">
          {round.submitted
            ? t('checkin.done', { date: formatDate(round.nextRoundStart, locale) })
            : round.daysUntilDue > 0
              ? t('checkin.left', { count: round.daysUntilDue })
              : t('checkin.today')}
        </p>
        <div className="flex flex-wrap gap-2.5 pt-3.5">
          {!round.submitted && (
            <Link href={`/classes/${classId}/project/checkin`} className={`${primaryButtonClass} flex-1`}>
              {t('checkin.submit')}
            </Link>
          )}
          <Link href={`/classes/${classId}/project/checkins`} className={`${secondaryButtonClass} flex-1`}>
            {t('checkin.feed')}
          </Link>
        </div>
      </section>

      <section aria-labelledby={`meeting-heading-${where}`} className="rule-card flex flex-col px-5 py-5">
        <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('meetingCard.kicker')}</p>
        <h2 id={`meeting-heading-${where}`} className="font-heading text-[17px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">
          {nextMeeting ? nextMeeting.title : openPoll ? t('meetingCard.voting', { title: openPoll.title }) : t('meetingCard.none')}
        </h2>
        {nextMeeting && <p className="text-[13px] leading-7 text-muted">{nextMeeting.when}</p>}
        <div className="pt-3.5">
          <Link
            href={nextMeeting ? `${meetingsHref}/${nextMeeting.id}` : openPoll ? `${meetingsHref}/${openPoll.id}` : `${meetingsHref}/new`}
            className={`${secondaryButtonClass} w-full`}
          >
            {nextMeeting ? t('meetingCard.open') : openPoll ? t('meetingCard.vote') : t('meetingCard.pick')}
          </Link>
        </div>
      </section>
    </>
  )
}
