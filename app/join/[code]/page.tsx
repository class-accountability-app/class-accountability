import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { EmptyState, emptyActionClass } from '@/components/empty-state'
import { JoinForm } from './join-form'

type ClassByCode = {
  id: string
  name: string
  university: string
  term: string
  member_count: number
  is_member: boolean
}

// Screen 04: /join/{code}, from the class link or its QR code.
// Logged out, the proxy sends the student to /login?next=/join/{code}; without
// a chosen name, to /welcome?next=… first. Both come back here.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`)
  }

  // class_by_join_code (0012) shows a class and its member count to someone
  // who isn't in it yet; it never returns names.
  const [{ data: cls }, t] = await Promise.all([
    supabase.rpc('class_by_join_code', { code }).maybeSingle<ClassByCode>(),
    getTranslations('join'),
  ])

  if (!cls) {
    return (
      <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
        <div className="flex w-full max-w-md flex-col gap-5">
          <p className="font-meta text-[13px] text-muted">{t('eyebrow')}</p>
          <EmptyState
            illustration="notFound"
            title={t('invalidTitle')}
            headingLevel="h1"
            body={t('invalidBody')}
            action={
              <Link href="/" className={emptyActionClass}>
                {t('home')}
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  if (cls.is_member) {
    redirect(`/classes/${cls.id}`)
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="relative mt-12 flex w-full max-w-md flex-col gap-3.5 rounded-[2px] border border-border bg-surface px-[22px] py-7">
        {/* Masking tape, as in the mockup. */}
        <div
          aria-hidden
          className="absolute -top-[13px] left-1/2 -ml-[52px] h-[26px] w-[104px] -rotate-3 bg-[rgba(201,164,104,0.5)] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0,rgba(255,255,255,0.18)_6px,transparent_6px,transparent_12px)]"
        />
        <p className="font-meta text-[13px] text-muted">{t('eyebrow')}</p>
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{cls.name}</h1>
        <p className="-mt-1.5 font-meta text-[13px] text-muted">
          {t('meta', { term: cls.term, count: Number(cls.member_count) })}
        </p>
        <p className="mt-1.5 text-[15px] leading-[1.85] text-ink/85">{t('body')}</p>
        <JoinForm code={code} />
      </div>
    </div>
  )
}
