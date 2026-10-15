import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { isClassId, podStepHref } from '@/lib/first-run'
import { StepHead } from '@/components/first-run/step-head'
import { SimpleTargetForm } from '@/components/target-form/simple-target-form'

// Step 3 of 3 of the first-run flow (Prompt 15): the first target, then Home
// (or the editor, for 「ここでレポートを書く」). Works when opened directly:
// not a student of this class, or a target already set → Home. Back goes to
// the pod step only while there is still no pod to make.
export default async function StartTargetPage({
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

  if (membership?.role !== 'student' || (targetCount ?? 0) > 0) redirect('/')

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-7">
        <StepHead step={3} backHref={(inPod ?? []).length > 0 ? undefined : podStepHref(classId)} />
        <div>
          <h1 className="font-heading text-[27px] leading-7 font-bold text-ink">{t('target.title')}</h1>
          <p className="text-[15px] leading-7 text-ink/85">{t('target.lead')}</p>
        </div>
        <SimpleTargetForm classId={classId} doneHref="/" />
      </div>
    </div>
  )
}
