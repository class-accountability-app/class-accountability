import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { CreateClassForm } from './create-class-form'
import { CodeJoinForm } from '@/components/code-join-form'

type MembershipRow = {
  class_id: string
  classes: { id: string; name: string; term: string } | null
}

// クラス: the classes I'm in, and joining another with its code. Other classes
// aren't listed: since 0013 a class is visible only to its members, and the
// code (link, QR or typed) is the only way in.
export default async function ClassesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: memberships }, t] = await Promise.all([
    supabase
      .from('class_memberships')
      .select('class_id, classes(id, name, term)')
      .eq('user_id', user.id)
      .order('joined_at'),
    getTranslations('classes'),
  ])

  const classes = ((memberships as MembershipRow[] | null) ?? [])
    .map((m) => m.classes)
    .filter((c): c is NonNullable<MembershipRow['classes']> => c !== null)

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{t('title')}</h1>

        <section
          aria-labelledby="join-by-code"
          className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-5"
        >
          <h2 id="join-by-code" className="font-heading text-xl font-bold text-ink">
            {t('joinByCodeHeading')}
          </h2>
          <CodeJoinForm />
        </section>

        <section aria-labelledby="my-classes" className="flex flex-col gap-3">
          <h2 id="my-classes" className="font-heading text-xl font-bold text-ink">
            {t('myClassesHeading')}
          </h2>
          {classes.length === 0 ? (
            <p className="text-sm leading-[1.8] text-ink/85">{t('noClasses')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/classes/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-[2px] border border-border bg-surface px-4 py-3.5"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-heading text-lg font-bold text-ink">{c.name}</span>
                      <span className="font-meta text-xs text-muted">{c.term}</span>
                    </span>
                    <svg
                      aria-hidden
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-ink"
                    >
                      <path d="M8 4.5L13.5 10 8 15.5" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="create-class" aria-labelledby="create-class-heading" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="create-class-heading" className="font-heading text-lg font-semibold text-ink">
            {t('createHeading')}
          </h2>
          <CreateClassForm />
        </section>
      </div>
    </div>
  )
}
