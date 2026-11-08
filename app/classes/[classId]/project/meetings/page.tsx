import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { primaryButtonClass } from '@/components/buttons'
import { PodProgressLink } from '@/components/pod-progress-link'
import { loadMyPodProject } from '../load'
import { chosenStart, formatMeeting, isUpcoming, loadPolls } from './load'

// 打ち合わせ: upcoming meetings, polls still being answered, and 日程をきめる.
export default async function MeetingsPage({ params }: { params: Promise<{ classId: string }> }) {
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

  const now = new Date()
  const polls = await loadPolls(supabase, pod.project.id)
  const upcoming = polls
    .filter((p) => isUpcoming(p, now))
    .sort((a, b) => (chosenStart(a) ?? '').localeCompare(chosenStart(b) ?? ''))
  const open = polls.filter((p) => p.status === 'open')
  const base = `/classes/${classId}/project/meetings`

  return (
    // Soft pastel (2026-11-06): a light kicker over a bold title, the new
    // poll button beside it, and a poll still waiting on my answer on Hudson.
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="px-0.5">
          <Link href={`/classes/${classId}/project`} className="-ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-container">
            {t('back')}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
            <h1 className="font-heading text-[28px] leading-tight font-light text-ink lg:text-[36px]">
              {t('meetings.titleKicker')}
              <br />
              <span className="font-bold">{t('meetings.title')}</span>
            </h1>
            <Link href={`${base}/new`} className={primaryButtonClass}>
              {t('meetings.new')}
            </Link>
          </div>
          <p className="pt-2 text-sm leading-7 text-muted">{t('meetings.why')}</p>
        </div>

        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-7">
          <h2 id="upcoming-heading" className="-mb-3.5 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
            {t('meetings.upcoming')}
          </h2>
          {upcoming.length === 0 ? (
            <p className="rule-card px-5 py-5 text-sm leading-7 text-muted">{t('meetings.noUpcoming')}</p>
          ) : (
            upcoming.map((p) => (
              <PodProgressLink
                key={p.id}
                href={`${base}/${p.id}`}
                title={p.title}
                sub={formatMeeting(chosenStart(p)!, p.durationMinutes, locale)}
              />
            ))
          )}
        </section>

        <section aria-labelledby="open-heading" className="flex flex-col gap-7">
          <h2 id="open-heading" className="-mb-3.5 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
            {t('meetings.open')}
          </h2>
          {open.length === 0 ? (
            <p className="rule-card px-5 py-5 text-sm leading-7 text-muted">{t('meetings.noOpen')}</p>
          ) : (
            open.map((p) => {
              const answered = new Set(p.votes.map((v) => v.userId)).size
              const mine = p.votes.some((v) => v.userId === user.id)
              return (
                <PodProgressLink
                  key={p.id}
                  href={`${base}/${p.id}`}
                  title={p.title}
                  sub={
                    mine
                      ? t('meetings.answered', { answered, total: pod.members.length })
                      : `${t('meetings.notAnswered')} · ${t('meetings.answered', { answered, total: pod.members.length })}`
                  }
                  tone={mine ? undefined : 'attention'}
                />
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
