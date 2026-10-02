import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { CONTACT_EMAIL, dataDeletionHref } from '@/lib/contact'
import { logServerError } from '@/lib/errors'
import { DeleteAccountForm } from './delete-form'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('deleteAccount')
  return { title: t('title') }
}

type OrganizedClass = { classes: { join_code: string } | null }

// 設定 → アカウントを削除. Says what goes, then the type-to-confirm form. The
// organizer of a class that still has students gets a contact message
// instead (delete_my_account refuses them too, SP004).
export default async function DeleteAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [t, { data: organized, error }] = await Promise.all([
    getTranslations('deleteAccount'),
    supabase
      .from('class_memberships')
      .select('classes(join_code)')
      .eq('user_id', user.id)
      .eq('role', 'organizer'),
  ])
  if (error) logServerError('deleteAccountPage.organized', error)

  // Organizers can't read their students' memberships (0015), so count them
  // the same way the organizer's class page does.
  const counts = await Promise.all(
    ((organized as OrganizedClass[] | null) ?? []).map(async (row) => {
      if (!row.classes) return 0
      const { data } = await supabase
        .rpc('class_by_join_code', { code: row.classes.join_code })
        .maybeSingle<{ member_count: number }>()
      return Number(data?.member_count ?? 0)
    })
  )
  const blocked = counts.some((n) => n > 0)

  const items = [
    t('itemProfile'),
    t('itemClasses'),
    t('itemTargets'),
    t('itemDocuments'),
    t('itemComments'),
    t('itemNudges'),
    t('itemInvitations'),
  ]

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{t('title')}</h1>

        {blocked ? (
          <section className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-[18px]">
            <p className="text-[15px] leading-[1.8] text-ink">{t('organizerBlocked')}</p>
            <a
              href={dataDeletionHref(t('organizerSubject'))}
              className="text-[15px] font-semibold text-accent-text underline underline-offset-4 [overflow-wrap:anywhere]"
            >
              {CONTACT_EMAIL}
            </a>
          </section>
        ) : (
          <section className="flex flex-col gap-4 rounded-[2px] border border-border bg-surface p-[18px]">
            <p className="text-[15px] leading-[1.8] text-ink">{t('intro')}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] leading-[1.7] text-ink">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-sm leading-[1.8] text-muted">{t('othersNote')}</p>
            <DeleteAccountForm />
            <p className="text-sm leading-[1.8] text-muted">
              {t('emailOption')}{' '}
              <a
                href={dataDeletionHref(t('emailSubject'))}
                className="font-semibold text-accent-text underline underline-offset-4 [overflow-wrap:anywhere]"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        )}

        <Link href="/settings" className="text-sm font-medium text-accent-text underline underline-offset-4">
          {t('back')}
        </Link>
      </div>
    </div>
  )
}
