import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatTimeAgo } from '@/lib/date'
import { EmptyState, emptyActionClass } from '@/components/empty-state'
import { PushCard } from './push-card'

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
    supabase.from('class_memberships').select('class_id').eq('user_id', user.id),
  ])

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
  const podHref = classIds.length === 1 ? `/classes/${classIds[0]}/progress` : '/classes'

  // On the notebook rule (Prompt 13a), like Home: text on 28px lines, gaps
  // of one line, and cards (.rule-card, 14px padding) whole lines tall.
  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-7">
        <h1 className="font-heading text-[27px] leading-7 font-bold text-ink">{t('title')}</h1>

        {/* Offered only once a nudge has actually arrived. */}
        {(nudges ?? []).length > 0 && <PushCard />}

        {(nudges ?? []).length === 0 ? (
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
          <ul className="flex flex-col gap-7">
            {(nudges ?? []).map((n) => (
              <li key={n.id} className="rule-card flex flex-col px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-heading text-sm leading-7 font-semibold text-accent-text [overflow-wrap:anywhere]">
                    {senderNames.get(n.from_user_id) ?? tCommon('unknownPerson')}
                  </span>
                  {/* leading-none: a second 28px line in another size would
                      make the row taller than one line. */}
                  <span className="shrink-0 font-meta text-xs leading-none text-muted">
                    {formatTimeAgo(n.created_at, locale, now)}
                  </span>
                </div>
                {n.content && <p className="text-sm leading-7 text-ink [overflow-wrap:anywhere]">{n.content}</p>}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[13px] leading-7 text-muted">{t('rule')}</p>
      </div>
    </div>
  )
}
