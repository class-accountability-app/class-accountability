import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatTimeAgo } from '@/lib/date'
import { EmptyState, emptyActionClass } from '@/components/empty-state'
import { PushCard } from './push-card'
import { isTeacherOnly } from '@/lib/nav'
import { AnnouncementManager, type Announcement } from '@/components/teacher/announcement-manager'

const NUDGES_SHOWN = 50

// Screen 12: nudges this student has received, newest first. There is no
// read/unread state in the database yet, so there is no unread dot.
export default async function NudgesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: nudges }, { data: memberships }] = await Promise.all([
    supabase
      .from('nudges')
      .select('id, from_user_id, content, created_at')
      .eq('to_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(NUDGES_SHOWN),
    supabase.from('class_memberships').select('class_id, role, classes(name)').eq('user_id', user.id).order('joined_at'),
  ])

  // A teacher-only account never receives 声かけ (organizers aren't in teams),
  // so this tab is their お知らせ: what they've told each class, and a place
  // to write the next one.
  if (isTeacherOnly((memberships ?? []).map((m) => m.role))) {
    const teaching = (memberships ?? []).filter((m) => m.role === 'organizer')
    const [tTeacher, ...lists] = await Promise.all([
      getTranslations('teacherAnnouncements'),
      ...teaching.map((m) =>
        supabase
          .from('class_announcements')
          .select('id, body, created_at')
          .eq('class_id', m.class_id)
          .order('created_at', { ascending: false })
          .limit(20)
      ),
    ])
    return (
      <div className="flex flex-1 flex-col px-4 pt-7 pb-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl">
          <header className="px-0.5">
            <h1 className="font-heading text-[28px] leading-tight font-light text-ink lg:text-[36px]">
              {tTeacher('kicker')}
              <br />
              <span className="font-bold">{tTeacher('title')}</span>
            </h1>
            <p className="pt-1 text-sm leading-7 text-muted">{tTeacher('why')}</p>
          </header>
          {teaching.map((m, i) => (
            <section key={m.class_id} aria-label={(m.classes as unknown as { name: string } | null)?.name ?? ''} className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 px-0.5">
                <p className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">
                  {(m.classes as unknown as { name: string } | null)?.name ?? ''}
                </p>
                <Link
                  href={`/classes/${m.class_id}`}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
                >
                  {tTeacher('openClass')}
                </Link>
              </div>
              <AnnouncementManager classId={m.class_id} announcements={(lists[i].data as Announcement[] | null) ?? []} />
            </section>
          ))}
        </div>
      </div>
    )
  }

  // Senders are podmates, so classmates, so RLS lets us read their names.
  // Someone who has since left the class falls back to "Unknown".
  const senderIds = [...new Set((nudges ?? []).map((n) => n.from_user_id))]
  const { data: senders } =
    senderIds.length > 0
      ? await supabase.from('profiles').select('id, display_name').in('id', senderIds)
      : { data: [] as { id: string; display_name: string }[] }
  const senderNames = new Map((senders ?? []).map((s) => [s.id, s.display_name]))

  const [t, tCommon, locale] = await Promise.all([
    getTranslations('nudgesPage'),
    getTranslations('common'),
    getLocale(),
  ])
  const now = new Date()

  const classIds = (memberships ?? []).map((m) => m.class_id)
  const podHref = classIds.length === 1 ? `/classes/${classIds[0]}/project` : '/classes'

  // Soft pastel (2026-11-06): a light kicker over a bold title with the
  // daily limit right under it, each 声かけ as a card with the sender's
  // initial, and from 1024px the notification card beside the list.
  const list = nudges ?? []
  return (
    <div className="flex flex-1 flex-col px-4 pt-7 pb-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl lg:max-w-5xl">
        <header className="px-0.5">
          <h1 className="font-heading text-[28px] leading-tight font-light text-ink lg:text-[36px]">
            {t('kicker')}
            <br />
            <span className="font-bold">{t('title')}</span>
          </h1>
          <p className="pt-1 text-sm leading-7 text-muted">{t('rule')}</p>
        </header>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7">

        {list.length === 0 ? (
          <EmptyState
            illustration="nudges"
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <Link href={podHref} className={emptyActionClass}>
                {t('viewPod')}
              </Link>
            }
            ruled
          />
        ) : (
          <section aria-labelledby="received-heading" className="flex flex-col gap-3.5">
            <h2 id="received-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
              {t('receivedHeading', { count: list.length })}
            </h2>
            <ul className="flex flex-col gap-4">
              {list.map((n) => {
                const name = senderNames.get(n.from_user_id) ?? tCommon('unknownPerson')
                return (
                  <li key={n.id} className="rule-card flex items-start gap-4 px-5 py-4">
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint-penna text-base font-bold text-ink">
                      {[...name][0]}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">
                          {t('from', { name })}
                        </span>
                        <span className="shrink-0 font-meta text-xs text-muted">{formatTimeAgo(n.created_at, locale, now)}</span>
                      </div>
                      {n.content && <p className="text-sm leading-7 text-ink [overflow-wrap:anywhere]">{n.content}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        </div>

        {/* Offered only once a nudge has actually arrived. */}
        {list.length > 0 && (
          <aside className="flex min-w-0 flex-col gap-7">
            <PushCard />
          </aside>
        )}
        </div>
      </div>
    </div>
  )
}
