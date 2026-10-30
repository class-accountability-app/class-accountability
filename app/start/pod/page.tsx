import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { isClassId, projectStepHref, startStepRedirect } from '@/lib/first-run'
import { StepHead } from '@/components/first-run/step-head'
import { primaryButtonClass } from '@/components/buttons'
import { CreatePodButton } from '@/app/classes/[classId]/create-pod-button'
import { TeamCodeForm } from '@/components/team/team-code-form'

// Step 2 of 3 of the first-run flow (Prompt 15): start a pod, ask to join one,
// or decide later. Starting a pod leads to its project (project first); later
// goes to the class page. It works when opened directly and shows the right state:
// not a student of this class, or a target already set → Home; already in a
// pod → on to the project. There is no way back: the name and the join before
// it can't be undone, so 「あとで決める」 is the way out.
export default async function StartPodPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string | string[] }>
}) {
  const { class: rawClass } = await searchParams
  if (!isClassId(rawClass)) redirect('/')
  const classId = rawClass

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: membership }, { count: targetCount }, { data: inPod }, t] = await Promise.all([
    supabase
      .from('class_memberships')
      .select('role')
      .eq('class_id', classId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('targets')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('user_id', user.id),
    supabase
      .from('pairing_members')
      .select('pairing_id, pairings!inner(class_id, status)')
      .eq('user_id', user.id)
      .eq('pairings.class_id', classId)
      .eq('pairings.status', 'active')
      .limit(1),
    getTranslations('firstRun'),
  ])

  const away = startStepRedirect(
    'pod',
    { role: membership?.role ?? null, targetsInClass: targetCount ?? 0, inPod: (inPod ?? []).length > 0 },
    classId
  )
  if (away) redirect(away)

  const toProject = projectStepHref(classId)
  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-7">
        <StepHead step={2} />
        <div>
          <h1 className="font-heading text-[27px] leading-7 font-bold text-ink">{t('pod.title')}</h1>
          <p className="text-[15px] leading-7 text-ink/85">{t('pod.lead')}</p>
        </div>
        <div className="flex flex-col gap-3.5">
          <CreatePodButton classId={classId} buttonClassName={`${primaryButtonClass} w-full`} goTo={toProject} />
          <TeamCodeForm />
          <div className="flex flex-col items-center">
            <Link
              href={`/classes/${classId}#other-pods`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline underline-offset-4"
            >
              {t('pod.other')}
            </Link>
            <Link
              href={`/classes/${classId}`}
              className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4"
            >
              {t('pod.later')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
