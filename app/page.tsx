import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { SETUP_SEEN_COOKIE, buildChecklist, type HomeClass, type StepId } from '@/lib/checklist'
import { MarkSetupSeen } from './setup-seen'

type MembershipRow = {
  class_id: string
  joined_at: string
  classes: { id: string; name: string; term: string } | null
}

type PodRow = { pairing_id: string; pairings: { class_id: string } | null }

// Home (screen 05): greeting, はじめの3ステップ while setting up, and the
// classes the student is in. No email here (it lives only in 設定), and no
// ログアウト (設定 on phones, the header on desktop).
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, { data: memberships }, { data: myPods }, { count: targetCount }] =
    await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase
        .from('class_memberships')
        .select('class_id, joined_at, classes(id, name, term)')
        .eq('user_id', user.id)
        .order('joined_at'),
      supabase
        .from('pairing_members')
        .select('pairing_id, pairings!inner(class_id, status)')
        .eq('user_id', user.id)
        .eq('pairings.status', 'active'),
      supabase
        .from('targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ])

  const podByClass = new Map<string, string>()
  for (const p of (myPods as PodRow[] | null) ?? []) {
    if (p.pairings) podByClass.set(p.pairings.class_id, p.pairing_id)
  }

  const podIds = [...podByClass.values()]
  const { data: podMembers } =
    podIds.length > 0
      ? await supabase.from('pairing_members').select('pairing_id').in('pairing_id', podIds)
      : { data: [] as { pairing_id: string }[] }
  const podSize = new Map<string, number>()
  for (const m of podMembers ?? []) podSize.set(m.pairing_id, (podSize.get(m.pairing_id) ?? 0) + 1)

  const classes: HomeClass[] = ((memberships as MembershipRow[] | null) ?? [])
    .filter((m) => m.classes)
    .map((m) => {
      const podId = podByClass.get(m.class_id)
      return {
        id: m.class_id,
        name: m.classes!.name,
        term: m.classes!.term,
        podSize: podId ? (podSize.get(podId) ?? 1) : null,
      }
    })

  const checklist = buildChecklist(classes, (targetCount ?? 0) > 0)
  const seenAllDone = (await cookies()).get(SETUP_SEEN_COOKIE)?.value === user.id
  const showChecklist = !checklist.allDone || !seenAllDone

  const t = await getTranslations('home')

  return (
    <div className="flex flex-1 flex-col px-5 pt-7 pb-8 sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">
          {profile?.display_name
            ? t('greeting', { name: profile.display_name })
            : t('greetingNoName')}
        </h1>

        {showChecklist &&
          (checklist.allDone ? (
            <section className="rounded-[2px] border border-border bg-surface p-5">
              <p role="status" className="text-[15px] leading-[1.8] font-semibold text-ink">
                {t('setup.allDone')}
              </p>
              <MarkSetupSeen userId={user.id} />
            </section>
          ) : (
            <section
              aria-labelledby="setup-heading"
              className="rounded-[2px] border border-border bg-surface p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="setup-heading" className="font-heading text-xl font-bold text-ink">
                  {t('setup.heading')}
                </h2>
                <span className="shrink-0 font-meta text-xs text-muted">
                  {t('setup.count', { done: checklist.doneCount, total: 3 })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t('setup.heading')}
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={checklist.doneCount}
                aria-valuetext={t('setup.valueText', { done: checklist.doneCount, total: 3 })}
                className="mt-3 mb-2 h-1.5 overflow-hidden rounded-[2px] bg-border"
              >
                <div
                  className="h-full bg-ink"
                  style={{ width: `${(checklist.doneCount / 3) * 100}%` }}
                />
              </div>
              <ol>
                {checklist.steps.map((step, i) => (
                  <Step
                    key={step.id}
                    id={step.id}
                    number={i + 1}
                    done={step.done}
                    isNext={checklist.next === step.id}
                    isLast={i === checklist.steps.length - 1}
                    href={checklist.next === step.id ? checklist.nextHref : null}
                    joinedClassName={checklist.joinedClassName}
                  />
                ))}
              </ol>
            </section>
          ))}

        {classes.length > 0 && (
          <section aria-labelledby="classes-heading" className="flex flex-col gap-3">
            <h2 id="classes-heading" className="font-heading text-xl font-bold text-ink">
              {t('classesHeading')}
            </h2>
            <ul className="flex flex-col gap-2">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/classes/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-[2px] border border-border bg-surface px-4 py-3.5"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-heading text-lg font-bold text-ink">{c.name}</span>
                      <span className="font-meta text-xs text-muted">
                        {c.podSize === null
                          ? t('classMetaNoPod', { term: c.term })
                          : t('classMetaPod', { term: c.term, count: c.podSize })}
                      </span>
                    </span>
                    <svg
                      aria-hidden
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-ink"
                    >
                      <path d="M8 4.5L13.5 10 8 15.5" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/classes"
          className="self-start text-[15px] font-semibold text-accent-text underline underline-offset-4"
        >
          {t('findClasses')}
        </Link>
      </div>
    </div>
  )
}

async function Step({
  id,
  number,
  done,
  isNext,
  isLast,
  href,
  joinedClassName,
}: {
  id: StepId
  number: number
  done: boolean
  isNext: boolean
  isLast: boolean
  href: string | null
  joinedClassName: string | null
}) {
  const t = await getTranslations('home')
  const detail =
    done && id === 'join' && joinedClassName
      ? t('setup.joinedClass', { name: joinedClassName })
      : t(`setup.steps.${id}.body`)

  return (
    <li
      className={
        isNext
          ? '-mx-3.5 my-2 flex gap-3.5 rounded-[2px] border border-accent-text bg-page-bg px-3.5 py-4'
          : `flex gap-3.5 py-3.5 ${isLast ? '' : 'border-b border-dashed border-[#e3d4b0]'}`
      }
    >
      <span
        aria-hidden
        className={`inline-flex size-[30px] shrink-0 items-center justify-center rounded-full font-meta text-[13px] ${
          done
            ? '-rotate-[7deg] border-[1.5px] border-status-active text-status-active'
            : isNext
              ? '-rotate-[7deg] border-[1.5px] border-accent-text text-accent-text'
              : 'border-[1.5px] border-dashed border-[#b9a57c] text-muted'
        }`}
      >
        {done ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        ) : (
          number
        )}
      </span>
      <div className="flex grow flex-col gap-1">
        <span className={`text-base font-semibold ${done ? 'text-muted' : 'text-ink'}`}>
          {t(`setup.steps.${id}.title`)}
          <span className="sr-only">
            {done ? t('setup.doneMark') : isNext ? t('setup.nextMark') : ''}
          </span>
        </span>
        <span className="text-sm leading-[1.7] text-ink/85">{detail}</span>
        {href && (
          <Link
            href={href}
            className="btn mt-2 inline-flex h-11 items-center justify-center self-start rounded-[2px] bg-accent px-[18px] text-sm font-semibold text-white"
          >
            {t(`setup.steps.${id}.action`)}
          </Link>
        )}
      </div>
    </li>
  )
}
