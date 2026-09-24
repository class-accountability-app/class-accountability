import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { JoinButton } from '../join-button'
import { CreatePodButton } from './create-pod-button'
import { RequestJoinButton } from './request-join-button'
import { InviteForm } from './invite-form'
import { InvitationActions } from './invitation-actions'
import { EmptyState } from '@/components/empty-state'

const POD_SOFT_CAP = 6

type PodMember = { pairing_id: string; user_id: string; profiles: { display_name: string } | null }
type Invitation = {
  id: string
  pod_id: string
  inviter_id: string
  invitee_id: string
  kind: 'invite' | 'request'
}

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
    .select('id, name, university, term')
    .eq('id', classId)
    .single()

  if (!cls) {
    redirect('/classes')
  }

  const [t, tCommon] = await Promise.all([getTranslations('pods'), getTranslations('common')])
  const unknown = tCommon('unknownPerson')

  const { data: membership } = await supabase
    .from('class_memberships')
    .select('status')
    .eq('class_id', classId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-4 py-12 sm:items-start sm:pl-16">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="font-heading text-xl font-semibold text-ink">{cls.name}</h1>
          <p className="text-sm text-muted">{t('joinToSee')}</p>
          <JoinButton classId={cls.id} />
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

  const [{ data: members }, { data: classmates }, { data: invitations }] = await Promise.all([
    podIds.length > 0
      ? supabase
          .from('pairing_members')
          .select('pairing_id, user_id, profiles(display_name)')
          .in('pairing_id', podIds)
      : Promise.resolve({ data: [] as PodMember[] }),
    supabase
      .from('class_memberships')
      .select('user_id, profiles(display_name)')
      .eq('class_id', classId),
    supabase
      .from('pod_invitations')
      .select('id, pod_id, inviter_id, invitee_id, kind')
      .eq('class_id', classId)
      .eq('status', 'pending'),
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

  function memberNames(podId: string) {
    return (membersByPod.get(podId) ?? [])
      .map((m) => m.profiles?.display_name ?? unknown)
      .join(tCommon('listSeparator'))
  }

  function memberCount(podId: string) {
    return t('memberCount', { count: (membersByPod.get(podId) ?? []).length, max: POD_SOFT_CAP })
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12 sm:items-start sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-2">
        <h1 className="font-heading text-xl font-semibold text-ink">{cls.name}</h1>
        <p className="font-meta text-xs text-muted">
          {tCommon('classMeta', { university: cls.university, term: cls.term })}
        </p>
        <Link
          href={`/classes/${cls.id}/progress`}
          className="text-xs font-medium text-accent-text underline underline-offset-2"
        >
          {t('progressLink')}
        </Link>
      </div>

      {invitesToMe.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-ink">{t('invitationsHeading')}</h2>
          <ul className="flex flex-col gap-2">
            {invitesToMe.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-border bg-surface px-4 py-3"
              >
                <span className="text-sm text-ink">
                  {t('invitedTo', { members: memberNames(inv.pod_id) || t('emptyPod') })}
                </span>
                <InvitationActions invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex w-full max-w-md flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-ink">{t('yourPod')}</h2>
        {myPods.length === 0 ? (
          <EmptyState
            illustration="pod"
            body={t('notInPod')}
            action={<CreatePodButton classId={classId} block />}
          />
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
                  !myPendingInvitePairs.has(`${podId}:${id}`)
              )
              .map(([id, displayName]) => ({ id, displayName }))
            const incomingRequests = invitationList.filter(
              (i) => i.kind === 'request' && i.pod_id === podId
            )

            return (
              <div
                key={podId}
                className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-heading text-sm font-semibold text-ink">
                    {memberNames(podId)}
                  </span>
                  <span className="font-meta text-xs text-muted">{memberCount(podId)}</span>
                </div>

                {incomingRequests.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-dashed border-border pt-3">
                    <span className="text-xs font-medium text-muted">{t('requestsHeading')}</span>
                    {incomingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <span className="text-sm text-ink">
                          {classmateNames.get(req.invitee_id) ?? unknown}
                        </span>
                        <InvitationActions invitationId={req.id} />
                      </div>
                    ))}
                  </div>
                )}

                {isFull ? (
                  <p className="text-xs text-muted">{t('podFull')}</p>
                ) : (
                  <InviteForm podId={podId} eligibleClassmates={eligibleClassmates} />
                )}
              </div>
            )
          })
        )}
        {myPods.length > 0 && <CreatePodButton classId={classId} />}
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">{t('otherPods')}</h2>
        {otherPods.length === 0 ? (
          <p className="text-sm text-muted">{t('noOtherPods')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {otherPods.map((podId) => {
              const podMembers = membersByPod.get(podId) ?? []
              const isFull = podMembers.length >= POD_SOFT_CAP
              const alreadyRequested = myPendingRequestPodIds.has(podId)

              return (
                <li
                  key={podId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-border bg-surface px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">{memberNames(podId) || t('emptyPod')}</span>
                    <span className="font-meta text-xs text-muted">{memberCount(podId)}</span>
                  </div>
                  {isFull ? (
                    <span className="text-xs font-medium text-muted">{t('full')}</span>
                  ) : alreadyRequested ? (
                    <span className="text-xs font-medium text-muted">{t('requested')}</span>
                  ) : (
                    <RequestJoinButton podId={podId} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
