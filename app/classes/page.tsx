import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { JoinButton } from './join-button'
import { CreateClassForm } from './create-class-form'

export default async function ClassesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, university, term')
    .order('name')

  const { data: memberships } = await supabase
    .from('class_memberships')
    .select('class_id')
    .eq('user_id', user.id)

  const joinedClassIds = new Set(memberships?.map((m) => m.class_id))
  const [t, tCommon] = await Promise.all([getTranslations('classes'), getTranslations('common')])

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-4 py-12 sm:items-start sm:pl-16">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="font-heading text-xl font-semibold text-ink sm:text-2xl">{t('title')}</h1>

        {classes && classes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {classes.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-border bg-surface px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-heading text-sm font-semibold text-ink">{c.name}</span>
                  <span className="font-meta text-xs text-muted">
                    {tCommon('classMeta', { university: c.university, term: c.term })}
                  </span>
                </div>
                {joinedClassIds.has(c.id) ? (
                  <Link
                    href={`/classes/${c.id}`}
                    className="text-xs font-medium text-accent-text underline underline-offset-2"
                  >
                    {t('viewPods')}
                  </Link>
                ) : (
                  <JoinButton classId={c.id} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('empty')}</p>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">{t('createHeading')}</h2>
        <CreateClassForm />
      </div>
    </div>
  )
}
