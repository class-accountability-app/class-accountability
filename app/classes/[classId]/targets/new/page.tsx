import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { TargetForm } from './target-form'

// Screen 07: 新しい目標, with template chips. The manual/automatic choice in
// the mockup is phase 3 and not built.
export default async function NewTargetPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: cls }, { data: membership }, t] = await Promise.all([
    supabase.from('classes').select('id, name').eq('id', classId).maybeSingle(),
    supabase
      .from('class_memberships')
      .select('class_id')
      .eq('class_id', classId)
      .eq('user_id', user.id)
      .maybeSingle(),
    getTranslations('targetForm'),
  ])

  if (!cls) {
    redirect('/classes')
  }
  if (!membership) {
    redirect(`/classes/${classId}`)
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <p className="font-meta text-[13px] text-muted">{cls.name}</p>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">
          {t('pageTitle')}
        </h1>
        <TargetForm classId={classId} />
      </div>
    </div>
  )
}
