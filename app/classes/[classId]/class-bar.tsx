import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

// The bar on top of every page of a class (2026-11-06, organizing several
// classes): back to クラス一覧, and with more than one class a menu to jump
// straight to another. A <details> menu of plain links: works before
// hydration and with the keyboard. Shows nothing to someone not in the class
// (the page itself redirects them).
export async function ClassBar({ classId }: { classId: string }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const [{ data }, t] = await Promise.all([
    supabase
      .from('class_memberships')
      .select('class_id, role, classes(name)')
      .eq('user_id', user.id)
      .order('joined_at'),
    getTranslations('classes'),
  ])
  const mine = ((data as unknown as { class_id: string; role: string; classes: { name: string } | null }[] | null) ?? []).filter(
    (m) => m.classes !== null
  )
  const current = mine.find((m) => m.class_id === classId)
  if (!current) return null
  const others = mine.filter((m) => m.class_id !== classId)

  return (
    <nav aria-label={t('classNav')} className="print-hidden px-4 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-2 md:max-w-xl lg:max-w-6xl">
        <Link
          href="/classes"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink hover:bg-surface-container"
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {t('allClasses')}
        </Link>
        {others.length > 0 && (
          <details className="relative">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_var(--border)] [&::-webkit-details-marker]:hidden">
              <span className="max-w-[14rem] truncate">{current.classes!.name}</span>
              <span className="sr-only">{t('switchClass')}</span>
              <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <ul className="absolute left-0 z-30 mt-2 flex min-w-[16rem] flex-col rounded-[20px] bg-surface p-2 shadow-[0_8px_24px_rgba(31,31,31,0.16)]">
              <li className="px-3 pt-1 pb-2 font-meta text-xs text-muted">{t('switchClass')}</li>
              {others.map((m) => (
                <li key={m.class_id}>
                  <Link
                    href={`/classes/${m.class_id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold text-ink hover:bg-surface-container"
                  >
                    <span className="[overflow-wrap:anywhere]">{m.classes!.name}</span>
                    {m.role === 'organizer' && <span className="shrink-0 font-meta text-xs font-normal text-muted">{t('organizerMark')}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </nav>
  )
}
