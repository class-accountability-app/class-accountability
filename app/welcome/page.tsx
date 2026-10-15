import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/next-path'
import { joinCodeFromNext, startsFirstRun } from '@/lib/first-run'
import { readFirstRunFacts } from '@/lib/first-run-facts'
import { StepHead } from '@/components/first-run/step-head'
import { WelcomeForm } from './welcome-form'

type ClassByCode = { name: string; term: string }

// Screen 03, step 1 of the first-run flow. The proxy sends every student who
// hasn't chosen a display name here first (lib/supabase/middleware.ts), with
// the page they wanted in `next`. When that is a class invitation, this screen
// names the class and one button saves the name and joins it. The step count
// shows only when the student has nothing yet (lib/first-run.ts), because only
// then do the pod and target steps follow.
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

  const code = joinCodeFromNext(next)
  const [{ data: profile }, { data: cls }, facts, t] = await Promise.all([
    supabase.from('profiles').select('display_name, name_chosen_at').eq('id', user.id).single(),
    // class_by_join_code (0012) names a class to someone who isn't in it yet.
    code
      ? supabase.rpc('class_by_join_code', { code }).maybeSingle<ClassByCode>()
      : Promise.resolve({ data: null }),
    readFirstRunFacts(supabase, user.id),
    getTranslations('welcome'),
  ])

  // Already chosen (e.g. an old bookmark to /welcome): carry on.
  if (!profile || profile.name_chosen_at) {
    redirect(next)
  }

  const joining = cls !== null
  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-7">
        {joining && startsFirstRun(facts) && <StepHead step={1} />}
        <div>
          <p className="font-meta text-[13px] leading-7 text-muted">
            {joining ? t('classLine', { className: cls.name, term: cls.term }) : t('eyebrow')}
          </p>
          <h1 className="font-heading text-[27px] leading-7 font-bold text-ink">{t('title')}</h1>
        </div>
        <p className="text-[15px] leading-7 text-ink/85">{t('body', { current: profile.display_name })}</p>
        <WelcomeForm currentName={profile.display_name} next={next} joining={joining} />
      </div>
    </div>
  )
}
