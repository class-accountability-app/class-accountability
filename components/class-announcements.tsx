import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/date'

// 先生からのお知らせ (0036) for students: the newest 3 of the class, on the
// Country Rubble tint that marks anything from the teacher. Shows
// nothing when there are none, or before 0036 (the table isn't there yet).
export async function ClassAnnouncements({ classId }: { classId: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_announcements')
    .select('id, body, created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(3)
  if (error || !data || data.length === 0) return null
  const [t, locale] = await Promise.all([getTranslations('organizer'), getLocale() as Promise<Locale>])

  return (
    <section aria-labelledby="announcements-heading" className="rule-card tint-rubble flex flex-col px-5 py-5">
      <h2 id="announcements-heading" className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-ink">
        {t('fromTeacher')}
      </h2>
      <ul className="flex flex-col">
        {data.map((a) => (
          <li key={a.id}>
            <p className="text-[15px] leading-7 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{a.body}</p>
            <p className="font-meta text-xs leading-7 text-muted">{formatDateTime(a.created_at, locale)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
