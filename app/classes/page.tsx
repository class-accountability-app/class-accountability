import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/date'
import { CreateClassForm } from './create-class-form'
import { CodeJoinForm } from '@/components/code-join-form'
import { JoinClassButton } from '@/components/join-class-button'

type MembershipRow = {
  class_id: string
  role: 'student' | 'organizer'
  classes: { id: string; name: string; term: string; join_code: string } | null
}
type PodRow = { pairings: { class_id: string; name: string | null; pairing_members: unknown[] } }
type ProjectRow = { title: string; deadline: string | null; pairings: { class_id: string } }

// クラス (2026-11-06: easier to organize several classes). The classes I teach
// and the classes I'm in, as two groups of cards; each card says in words
// where I stand (my team and project, or students and teams for a class I
// run). Joining and creating are the ＋ buttons at the top (the code form
// shows inline only while I have no class). Other classes aren't listed:
// since 0013 a class is visible only to its members, and the code is the
// only way in. Only approved accounts (0015) can create classes.
export default async function ClassesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: memberships }, { data: profile }, { data: podRows }, { data: projectRows }, t, locale] = await Promise.all([
    supabase
      .from('class_memberships')
      .select('class_id, role, classes(id, name, term, join_code)')
      .eq('user_id', user.id)
      .order('joined_at'),
    supabase.from('profiles').select('can_create_classes').eq('id', user.id).maybeSingle(),
    // My teams and their sizes (RLS: pods in my classes).
    supabase
      .from('pairing_members')
      .select('pairings!inner(class_id, name, status, pairing_members(user_id))')
      .eq('user_id', user.id)
      .eq('pairings.status', 'active'),
    // My teams' active projects (RLS: only pods I am in).
    supabase
      .from('projects')
      .select('title, deadline, pairings!inner(class_id, status)')
      .eq('status', 'active')
      .eq('pairings.status', 'active'),
    getTranslations('classes'),
    getLocale() as Promise<Locale>,
  ])

  const canCreate = profile?.can_create_classes === true
  const rows = ((memberships as MembershipRow[] | null) ?? []).filter((m) => m.classes !== null)
  const podOf = new Map(((podRows as unknown as PodRow[] | null) ?? []).map((p) => [p.pairings.class_id, p.pairings]))
  const projectOf = new Map(((projectRows as unknown as ProjectRow[] | null) ?? []).map((p) => [p.pairings.class_id, p]))

  // Classes I run: students (the join page's count) and teams (the summary's rows).
  const teaching = await Promise.all(
    rows
      .filter((m) => m.role === 'organizer')
      .map(async (m) => {
        const [{ data: byCode }, { data: summary }] = await Promise.all([
          supabase.rpc('class_by_join_code', { code: m.classes!.join_code }).maybeSingle<{ member_count: number }>(),
          supabase.rpc('class_team_summary', { p_class: m.class_id }),
        ])
        return {
          ...m.classes!,
          lines: [t('metaStudents', { students: Number(byCode?.member_count ?? 0), teams: ((summary as unknown[] | null) ?? []).length })],
        }
      })
  )
  const studying = rows
    .filter((m) => m.role === 'student')
    .map((m) => {
      const pod = podOf.get(m.class_id)
      const project = projectOf.get(m.class_id)
      const teamLine = pod
        ? pod.name
          ? t('metaTeamNamed', { team: pod.name, count: pod.pairing_members.length })
          : t('metaTeam', { count: pod.pairing_members.length })
        : t('metaNoTeam')
      const projectLine = project
        ? project.deadline
          ? t('metaProject', { title: project.title, date: formatDate(project.deadline, locale) })
          : project.title
        : pod
          ? t('metaNoProject')
          : null
      return { ...m.classes!, lines: [teamLine, projectLine].filter((l): l is string => !!l), needsTeam: !pod }
    })

  const card = (c: { id: string; name: string; term: string; lines: string[]; needsTeam?: boolean }) => (
    <li key={c.id}>
      <Link
        href={`/classes/${c.id}`}
        className={`rule-card flex min-h-[96px] items-center justify-between gap-4 px-5 py-4 hover:bg-surface-container ${c.needsTeam ? 'tint-hudson' : ''}`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-meta text-xs leading-6 text-muted">{c.term}</span>
          <span className="text-[17px] leading-7 font-bold text-ink [overflow-wrap:anywhere]">{c.name}</span>
          {c.lines.map((line) => (
            <span key={line} className="text-[13px] leading-6 text-ink [overflow-wrap:anywhere]">
              {line}
            </span>
          ))}
        </span>
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </span>
      </Link>
    </li>
  )

  return (
    <div className="flex flex-1 flex-col px-4 pt-7 pb-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 md:max-w-xl lg:max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3 px-0.5">
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-tight font-bold text-ink lg:text-[36px]">{t('title')}</h1>
            {!canCreate && <p className="pt-1 text-sm leading-7 text-muted">{t('teachersCreate')}</p>}
          </div>
          <JoinClassButton canCreate={canCreate} />
        </header>

        {rows.length === 0 && (
          <section aria-labelledby="join-by-code" className="rule-card flex flex-col gap-3 px-5 py-5">
            <h2 id="join-by-code" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {t('joinByCodeHeading')}
            </h2>
            <p className="text-sm leading-7 text-muted">{t('noClasses')}</p>
            <CodeJoinForm />
          </section>
        )}

        {teaching.length > 0 && (
          <section aria-labelledby="teaching-heading" className="flex flex-col gap-3.5">
            <h2 id="teaching-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
              {t('teachingHeading', { count: teaching.length })}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">{teaching.map(card)}</ul>
          </section>
        )}

        {studying.length > 0 && (
          <section aria-labelledby="studying-heading" className="flex flex-col gap-3.5">
            <h2 id="studying-heading" className="px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
              {t('studyingHeading', { count: studying.length })}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">{studying.map(card)}</ul>
          </section>
        )}

        {canCreate && (
          <section id="create-class" aria-labelledby="create-class-heading" className="rule-card flex scroll-mt-4 flex-col gap-3 px-5 py-5">
            <h2 id="create-class-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
              {t('createHeading')}
            </h2>
            <CreateClassForm />
          </section>
        )}
      </div>
    </div>
  )
}
