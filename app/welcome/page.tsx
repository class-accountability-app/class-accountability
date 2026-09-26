import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/next-path'
import { WelcomeForm } from './welcome-form'

// Screen 03. The proxy sends every student who hasn't chosen a display name
// here first (lib/supabase/middleware.ts), with the page they wanted in `next`.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next: rawNext } = await searchParams
  const next = safeNextPath(typeof rawNext === 'string' ? rawNext : null)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, t] = await Promise.all([
    supabase.from('profiles').select('display_name, name_chosen_at').eq('id', user.id).single(),
    getTranslations('welcome'),
  ])

  // Already chosen (e.g. an old bookmark to /welcome): carry on.
  if (!profile || profile.name_chosen_at) {
    redirect(next)
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <p className="font-meta text-[13px] text-muted">{t('eyebrow')}</p>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{t('title')}</h1>
        <p className="text-[15px] text-ink/85">{t('body', { current: profile.display_name })}</p>
        <WelcomeForm currentName={profile.display_name} next={next} />
      </div>
    </div>
  )
}
