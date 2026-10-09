import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { RequestJoinButton } from './request-join-button'
import { InviteForm } from './invite-form'
import { InvitationActions } from './invitation-actions'
import { LeavePodButton } from './leave-pod-button'
import { EmptyState } from '@/components/empty-state'
import { InviteCard } from './invite-card'
import { appOrigin } from '@/lib/app-origin'
import { groupedCode, joinUrl, shortJoinUrl } from '@/lib/join-link'
import { qrSvg } from '@/lib/qr'
import { sortHomeTargets } from '@/lib/home-targets'
import { tidyTotal } from '@/lib/quick-log'
import { loggedOnTokyoDay, nextStep } from '@/lib/next-step'
import { loadMyTargets } from '@/components/quick-log/load'
import { QuickLogProvider } from '@/components/quick-log/quick-log-provider'
import { FinishedTargets, StickyLog, TargetCard } from '@/components/quick-log/target-card'
import { NextStepCard } from '@/components/next-step-card'
import { PodProgressLink } from '@/components/pod-progress-link'
import { RuleSnap } from '@/components/rule-snap'
import { secondaryButtonClass } from '@/components/buttons'
import { InviteDisclosure } from './invite-disclosure'

const POD_SOFT_CAP = 6

type PodMember = { pairing_id: string; user_id: string; profiles: { display_name: string } | null }
type Invitation = {
  id: string
  pod_id: string
  inviter_id: string
  invitee_id: string
  kind: 'invite' | 'request'
}

// A class page (screen 06, reordered in Prompt 11b): for a student, in this
// order, 次にやること for this class, あなたの目標 (with ＋記録), あなたのポッド
// with a card link to the pod's progress, 仲間を招待する (link and QR behind
// one button) and, while I have no pod, the other pods to ask to join. Each
// heading has one line saying what the section is for. Two columns from
// 1024px, like Home. The organizer sees only the student count and the link.
export default async function ClassPodsPage({
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

  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, university, term, join_code')
    .eq('id', classId)
    .single()

  if (!cls) {
    redirect('/classes')
  }

  const [t, tCommon] = await Promise.all([getTranslations('pods'), getTranslations('common')])
  const unknown = tCommon('unknownPerson')

  const { data: membership } = await supabase
    .from('class_memberships')
    .select('status, role')
    .eq('class_id', classId)
    .eq('user_id', user.id)
    .maybeSingle()

  // Only members (and the creator) can see a class (0013); joining happens
  // only with the code, at /join/{code}.
  if (!membership) {
    redirect('/classes')
  }

  const url = joinUrl(await appOrigin(), cls.join_code)
  const shortUrl = shortJoinUrl(url)
  const svg = await qrSvg(url)
  const inviteCard = (
    <InviteCard
      url={url}
      shortUrl={shortUrl}
      code={cls.join_code}
      groupedCode={groupedCode(cls.join_code)}
      classTitle={cls.name}
      qrSvg={svg}
    />
  )

  // The organizer (0015) shares the link and QR and sees how many students
  // have joined; never pods, progress or names (RLS hides them anyway).
  if (membership.role === 'organizer') {
    const { data: byCode } = await supabase
      .rpc('class_by_join_code', { code: cls.join_code })
      .maybeSingle<{ member_count: number }>()
    return (
      <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12 sm:items-start sm:pl-16">
        <div className="flex w-full max-w-md flex-col gap-2">
          <p className="font-meta text-[13px] text-muted">{cls.term}</p>
          <h1 className="font-heading text-[27px] leading-[1.45] font-bold text-ink">{cls.name}</h1>
          <p className="font-meta text-sm text-ink">
            {t('studentCount', { count: Number(byCode?.member_count ?? 0) })}
          </p>
          <p className="text-sm leading-[1.8] text-muted">{t('organizerNote')}</p>
        </div>
        <div id="invite" className="w-full max-w-md scroll-mt-4">
          {inviteCard}
        </div>
      </div>
    )
  }

  const { data: pods } = await supabase
    .from('pairings')
    .select('id')
    .eq('class_id', classId)
    .eq('status', 'active')
    .order('created_at')

  const podIds = pods?.map((p) => p.id) ?? []

  const [{ data: members }, { data: classmates }, { data: invitations }, quick] = await Promise.all([
    podIds.length > 0
      ? supabase
          .from('pairing_members')
          .select('pairing_id, user_id, profiles(display_name)')
          .in('pairing_id', podIds)
      : Promise.resolve({ data: [] as PodMember[] }),
    // Classmates to invite: students only (RLS already hides the organizer).
    supabase
      .from('class_memberships')
      .select('user_id, profiles(display_name)')
      .eq('class_id', classId)
      .eq('role', 'student'),
    supabase
      .from('pod_invitations')
      .select('id, pod_id, inviter_id, invitee_id, kind')
      .eq('class_id', classId)
      .eq('status', 'pending'),
    // あなたの目標: my targets here and all my logs on them.
    loadMyTargets(supabase, user.id, { classId }),
  ])

  const membersByPod = new Map<string, PodMember[]>()
  for (const m of (members as PodMember[] | null) ?? []) {
    const list = membersByPod.get(m.pairing_id) ?? []
    list.push(m)
    membersByPod.set(m.pairing_id, list)
  }

  const myPodIds = new Set(
    ((members as PodMember[] | null) ?? [])
      .filter((m) => m.user_id === user.id)
      .map((m) => m.pairing_id)
  )

  const invitationList = (invitations as Invitation[] | null) ?? []
  const invitesToMe = invitationList.filter(
    (i) => i.kind === 'invite' && i.invitee_id === user.id
  )
  const myPendingRequestPodIds = new Set(
    invitationList
      .filter((i) => i.kind === 'request' && i.invitee_id === user.id)
      .map((i) => i.pod_id)
  )
  const myPendingInvitePairs = new Set(
    invitationList
      .filter((i) => i.kind === 'invite' && i.inviter_id === user.id)
      .map((i) => `${i.pod_id}:${i.invitee_id}`)
  )

  const classmateNames = new Map<string, string>(
    (classmates ?? []).map((c) => [
      c.user_id,
      (c.profiles as unknown as { display_name: string } | null)?.display_name ?? unknown,
    ])
  )

  const myPods = podIds.filter((id) => myPodIds.has(id))
  const otherPods = podIds.filter((id) => !myPodIds.has(id))

  // One pod per class (0012): anyone already in a pod here can't be invited.
  const inAPod = new Set(((members as PodMember[] | null) ?? []).map((m) => m.user_id))

  function memberNames(podId: string) {
    return (membersByPod.get(podId) ?? [])
      .map((m) => m.profiles?.display_name ?? unknown)
      .join(tCommon('listSeparator'))
  }

  function memberCount(podId: string) {
    return t('memberCount', { count: (membersByPod.get(podId) ?? []).length, max: POD_SOFT_CAP })
  }

  // My targets here: unfinished first, nearest deadline first (as on Home,
  // so the sticky ＋記録 and 次にやること point at the same one).
  const now = new Date()
  const totals = new Map<string, number>()
  for (const log of quick.logs) totals.set(log.targetId, (totals.get(log.targetId) ?? 0) + log.value)
  const myTargets = sortHomeTargets(
    quick.rows.map((r) => {
      const total = tidyTotal(totals.get(r.id) ?? 0)
      const finished =
        r.target_type === 'task' ? total >= 1 : r.target_amount !== null && total >= Number(r.target_amount)
      return { ...r, total, finished, createdAt: r.created_at }
    })
  )
  const openTargets = myTargets.filter((x) => !x.finished)
  const finishedTargets = myTargets.filter((x) => x.finished)

  const myPodId = myPods[0] ?? null
  const step = nextStep({
    classes: [
      {
        id: cls.id,
        name: cls.name,
        organizer: false,
        podSize: myPodId ? (membersByPod.get(myPodId) ?? []).length : null,
        invited: invitesToMe.length > 0,
      },
    ],
    targets: myTargets.map((x) => ({
      id: x.id,
      classId: x.class_id,
      title: x.title,
      type: x.target_type,
      targetAmount: x.target_amount === null ? null : Number(x.target_amount),
      deadline: x.deadline,
      createdAt: x.created_at,
      total: x.total,
      inputMode: x.input_mode,
    })),
    loggedToday: loggedOnTokyoDay(
      quick.logs.map((l) => l.loggedAt),
      now
    ),
    now,
  })

  const sectionHead = (id: string, heading: string, why: string, action?: React.ReactNode) => (
    <div className="-mb-7 flex items-start justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h2 id={id} className="font-heading text-[17px] leading-7 font-bold text-ink">
          {heading}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{why}</p>
      </div>
      {action}
    </div>
  )

  return (
    <QuickLogProvider targets={quick.targets} logs={quick.logs} now={now.toISOString()}>
      <div className="flex flex-1 flex-col px-4 py-7 sm:px-6 sm:pl-16 lg:px-16 lg:pb-14">
        <div className="mx-auto grid w-full max-w-md gap-7 md:max-w-xl lg:max-w-[1120px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8">
          <div className="px-0.5 lg:col-span-2">
            <p className="font-meta text-[13px] leading-7 text-muted">{cls.term}</p>
            <h1 className="font-heading text-[26px] leading-7 font-bold text-ink">{cls.name}</h1>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <NextStepCard step={step} />
          </div>

          {invitesToMe.length > 0 && (
            <section
              id="invitations"
              aria-labelledby="invitations-heading"
              className="flex scroll-mt-4 flex-col gap-7 lg:col-span-2"
            >
              <h2 id="invitations-heading" className="-mb-7 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
                {t('invitationsHeading')}
              </h2>
              <ul className="flex flex-col gap-7">
                {invitesToMe.map((inv) => (
                  <li key={inv.id} className="rule-card flex flex-wrap items-center justify-between gap-x-3 px-3.5 py-3.5">
                    <RuleSnap>
                      <span className="text-sm leading-7 text-ink">
                        {t('invitedTo', { members: memberNames(inv.pod_id) || t('emptyPod') })}
                      </span>
                    </RuleSnap>
                    <RuleSnap>
                      <InvitationActions invitationId={inv.id} />
                    </RuleSnap>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="targets-heading" className="flex min-w-0 flex-col gap-7">
            {sectionHead(
              'targets-heading',
              t('yourTargets'),
              t('targetsWhy'),
              <Link href={`/classes/${classId}/targets/new`} className={`${secondaryButtonClass} mt-1.5`}>
                <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                {t('newTarget')}
              </Link>
            )}
            {myTargets.length === 0 ? (
              <p className="px-0.5 text-sm leading-7 text-muted">{t('noTargets')}</p>
            ) : (
              <>
                {openTargets.length > 0 && (
                  <ul className="flex flex-col gap-7">
                    {openTargets.map((target) => (
                      <TargetCard key={target.id} targetId={target.id} />
                    ))}
                  </ul>
                )}
                <FinishedTargets targetIds={finishedTargets.map((target) => target.id)} />
              </>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-7">
            <section aria-labelledby="pod-heading" className="flex flex-col gap-7">
              {sectionHead('pod-heading', t('yourPod'), t('yourPodWhy'))}
              {myPods.length === 0 ? (
                // 次にやること above already offers ポッドを作る; no second one here.
                <EmptyState illustration="pod" title={t('notInPodTitle')} headingLevel="h3" body={t('notInPod')} ruled />
              ) : (
                myPods.map((podId) => {
                  const podMembers = membersByPod.get(podId) ?? []
                  const isFull = podMembers.length >= POD_SOFT_CAP
                  const memberIds = new Set(podMembers.map((m) => m.user_id))
                  const eligibleClassmates = [...classmateNames.entries()]
                    .filter(
                      ([id]) =>
                        id !== user.id &&
                        !memberIds.has(id) &&
                        !inAPod.has(id) &&
                        !myPendingInvitePairs.has(`${podId}:${id}`)
                    )
                    .map(([id, displayName]) => ({ id, displayName }))
                  const incomingRequests = invitationList.filter((i) => i.kind === 'request' && i.pod_id === podId)

                  return (
                    <div key={podId} className="flex flex-col gap-7">
                      <div className="rule-card flex flex-col px-3.5 py-3.5">
                        <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">
                          {memberNames(podId)}
                        </span>
                        <span className="font-meta text-xs leading-7 text-muted">{memberCount(podId)}</span>

                        {incomingRequests.length > 0 && (
                          <RuleSnap>
                            <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3">
                              <span className="text-xs font-medium text-muted">{t('requestsHeading')}</span>
                              {incomingRequests.map((req) => (
                                <div key={req.id} className="flex flex-wrap items-center justify-between gap-3">
                                  <span className="text-sm text-ink">{classmateNames.get(req.invitee_id) ?? unknown}</span>
                                  <InvitationActions invitationId={req.id} />
                                </div>
                              ))}
                            </div>
                          </RuleSnap>
                        )}

                        <RuleSnap>
                          <div className="mt-3 flex flex-col gap-3">
                            {isFull ? (
                              <p className="text-xs text-muted">{t('podFull')}</p>
                            ) : (
                              <InviteForm podId={podId} eligibleClassmates={eligibleClassmates} />
                            )}
                            <LeavePodButton classId={classId} podId={podId} />
                          </div>
                        </RuleSnap>
                      </div>
                      <PodProgressLink
                        href={`/classes/${classId}/progress`}
                        title={t('podProgressLink')}
                        sub={t('podProgressSub')}
                      />
                    </div>
                  )
                })
              )}
            </section>

            <section id="invite" aria-labelledby="invite-heading" className="flex scroll-mt-4 flex-col">
              <div className="px-0.5">
                <h2 id="invite-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
                  {t('inviteHeading')}
                </h2>
                <p className="text-[13px] leading-7 text-muted">{t('inviteWhy')}</p>
              </div>
              <InviteDisclosure label={t('showLinkQr')}>{inviteCard}</InviteDisclosure>
            </section>

            {/* Asking to join another pod only makes sense while you have none. */}
            {myPods.length === 0 && (
              <section id="other-pods" aria-labelledby="other-pods-heading" className="flex scroll-mt-4 flex-col gap-7">
                <h2 id="other-pods-heading" className="-mb-7 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
                  {t('otherPods')}
                </h2>
                {otherPods.length === 0 ? (
                  <p className="px-0.5 text-sm leading-7 text-muted">{t('noOtherPods')}</p>
                ) : (
                  <ul className="flex flex-col gap-7">
                    {otherPods.map((podId) => {
                      const podMembers = membersByPod.get(podId) ?? []
                      const isFull = podMembers.length >= POD_SOFT_CAP
                      const alreadyRequested = myPendingRequestPodIds.has(podId)

                      return (
                        <li key={podId} className="rule-card flex flex-wrap items-center justify-between gap-x-3 px-3.5 py-3.5">
                          <div className="flex min-w-0 flex-col">
                            <span className="text-sm leading-7 text-ink">{memberNames(podId) || t('emptyPod')}</span>
                            <span className="font-meta text-xs leading-7 text-muted">{memberCount(podId)}</span>
                          </div>
                          {isFull ? (
                            <span className="text-xs leading-7 font-medium text-muted">{t('full')}</span>
                          ) : alreadyRequested ? (
                            <span className="text-xs leading-7 font-medium text-muted">{t('requested')}</span>
                          ) : (
                            <RequestJoinButton podId={podId} />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
        <StickyLog targetId={openTargets[0]?.id ?? null} />
      </div>
    </QuickLogProvider>
  )
}
