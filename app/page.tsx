import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, t] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    getTranslations('home'),
  ])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-2xl font-semibold text-ink sm:text-3xl">
          {profile?.display_name
            ? t('greeting', { name: profile.display_name })
            : t('greetingNoName')}
        </h1>
        <p className="font-meta text-sm text-muted">{user.email}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/classes"
          className="btn rounded-[2px] bg-accent px-5 py-3 text-sm font-medium text-white"
        >
          {t('goToClasses')}
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="btn rounded-[2px] border border-border bg-surface px-5 py-3 text-sm font-medium text-ink"
          >
            {t('signOut')}
          </button>
        </form>
      </div>
    </div>
  )
}
