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
    <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
        <div className="px-0.5">
          <Link href={`/classes/${classId}/project`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text">
            {t('back')}
          </Link>
          <h1 className="font-heading text-[26px] leading-7 font-bold text-ink">{t('meetings.title')}</h1>
          <p className="text-[13px] leading-7 text-muted">{t('meetings.why')}</p>
        </div>

        <Link href={`${base}/new`} className={`${primaryButtonClass} w-full`}>
          {t('meetings.new')}
        </Link>

        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-7">
          <h2 id="upcoming-heading" className="-mb-7 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
            {t('meetings.upcoming')}
          </h2>
          {upcoming.length === 0 ? (
            <p className="px-0.5 text-sm leading-7 text-muted">{t('meetings.noUpcoming')}</p>
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
          <h2 id="open-heading" className="-mb-7 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
            {t('meetings.open')}
          </h2>
          {open.length === 0 ? (
            <p className="px-0.5 text-sm leading-7 text-muted">{t('meetings.noOpen')}</p>
          ) : (
            open.map((p) => {
              const answered = new Set(p.votes.map((v) => v.userId)).size
              return (
                <PodProgressLink
                  key={p.id}
                  href={`${base}/${p.id}`}
                  title={p.title}
                  sub={t('meetings.answered', { answered, total: pod.members.length })}
                />
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
