import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JoinButton } from '../join-button'
import { CreatePodButton } from './create-pod-button'
import { RequestJoinButton } from './request-join-button'
import { InviteForm } from './invite-form'
import { InvitationActions } from './invitation-actions'

const POD_SOFT_CAP = 6

type PodMember = { pairing_id: string; user_id: string; profiles: { display_name: string }[] | null }
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

  const { data: membership } = await supabase
    .from('class_memberships')
    .select('status')
    .eq('class_id', classId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-4 py-12">
        <div className="flex w-full max-w-xs flex-col gap-3">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{cls.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Join this class to see and form pods.
          </p>
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
      (c.profiles as { display_name: string }[] | null)?.[0]?.display_name ?? 'Unknown',
    ])
  )

  const myPods = podIds.filter((id) => myPodIds.has(id))
  const otherPods = podIds.filter((id) => !myPodIds.has(id))

  function memberNames(podId: string) {
    return (membersByPod.get(podId) ?? []).map(
      (m) => m.profiles?.[0]?.display_name ?? 'Unknown'
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-2">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{cls.name}</h1>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {cls.university} · {cls.term}
        </p>
        <Link
          href={`/classes/${cls.id}/progress`}
          className="text-xs font-medium text-zinc-500 underline dark:text-zinc-400"
        >
          Targets &amp; progress
        </Link>
      </div>

      {invitesToMe.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Invitations for you
          </h2>
          <ul className="flex flex-col gap-2">
            {invitesToMe.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded border border-black/[.15] px-3 py-2 dark:border-white/[.2]"
              >
                <span className="text-sm text-black dark:text-zinc-50">
                  Invited to join a pod ({memberNames(inv.pod_id).join(', ') || 'empty pod'})
                </span>
                <InvitationActions invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex w-full max-w-md flex-col gap-4">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Your pod</h2>
        {myPods.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You&apos;re not in a pod yet. Create one or request to join one below.
          </p>
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
                className="flex flex-col gap-3 rounded border border-black/[.15] p-3 dark:border-white/[.2]"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {podMembers.map((m) => m.profiles?.[0]?.display_name ?? 'Unknown').join(', ')}
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {podMembers.length} / {POD_SOFT_CAP} members
                  </span>
                </div>

                {incomingRequests.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Requests to join
                    </span>
                    {incomingRequests.map((req) => (
                      <div key={req.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-black dark:text-zinc-50">
                          {classmateNames.get(req.invitee_id) ?? 'Unknown'}
                        </span>
                        <InvitationActions invitationId={req.id} />
                      </div>
                    ))}
                  </div>
                )}

                {isFull ? (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">Pod is full.</p>
                ) : (
                  <InviteForm podId={podId} eligibleClassmates={eligibleClassmates} />
                )}
              </div>
            )
          })
        )}
        <CreatePodButton classId={classId} />
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Other pods in this class
        </h2>
        {otherPods.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No other pods yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {otherPods.map((podId) => {
              const podMembers = membersByPod.get(podId) ?? []
              const isFull = podMembers.length >= POD_SOFT_CAP
              const alreadyRequested = myPendingRequestPodIds.has(podId)

              return (
                <li
                  key={podId}
                  className="flex items-center justify-between gap-3 rounded border border-black/[.15] px-3 py-2 dark:border-white/[.2]"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-black dark:text-zinc-50">
                      {podMembers.map((m) => m.profiles?.[0]?.display_name ?? 'Unknown').join(', ') ||
                        'Empty pod'}
                    </span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {podMembers.length} / {POD_SOFT_CAP} members
                    </span>
                  </div>
                  {isFull ? (
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Full
                    </span>
                  ) : alreadyRequested ? (
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Requested
                    </span>
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
