'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, logServerError, toErrorKey, type ActionResult } from '@/lib/errors'

// Soft cap only — no DB constraint (see 0003 decision log). Checked here, not
// enforced atomically; see 0004's comment on the accept race.
const POD_SOFT_CAP = 6

type Supabase = Awaited<ReturnType<typeof createClient>>

// The active pod someone is in within a class, if any. One per class is a
// hard rule (the one_pod_per_class trigger, 0012); the checks below that use
// this only give a clearer message before the database would refuse. RLS lets
// class members read the pod memberships of their class, so this works for a
// classmate too.
async function activePodInClass(
  supabase: Supabase,
  classId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pairing_members')
    .select('pairing_id, pairings!inner(class_id, status)')
    .eq('user_id', userId)
    .eq('pairings.class_id', classId)
    .eq('pairings.status', 'active')
    .limit(1)

  if (error) {
    logServerError('activePodInClass', error)
    return null
  }
  return data?.[0]?.pairing_id ?? null
}

export async function createPod(classId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  if (await activePodInClass(supabase, classId, user.id)) {
    return { error: 'alreadyInPod' }
  }

  // The pod and its first member in one transaction (0012), so a failure
  // can't leave an empty pod behind.
  const { error } = await supabase.rpc('create_pod', { target_class: classId })

  if (error) {
    return {
      error: toErrorKey('createPod', error, { [DB_CODES.onePodPerClass]: 'alreadyInPod' }),
    }
  }

  revalidatePath(`/classes/${classId}`)
  revalidatePath('/')
  return { error: null }
}

export async function sendInvite(podId: string, inviteeId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data: pod, error: podError } = await supabase
    .from('pairings')
    .select('class_id')
    .eq('id', podId)
    .single()

  if (podError || !pod) {
    if (podError) logServerError('sendInvite.findPod', podError)
    return { error: 'podNotFound' }
  }

  const inviteePod = await activePodInClass(supabase, pod.class_id, inviteeId)
  if (inviteePod) {
    return { error: inviteePod === podId ? 'alreadyPodmate' : 'inviteeInPod' }
  }

  const { error } = await supabase.from('pod_invitations').insert({
    pod_id: podId,
    class_id: pod.class_id,
    inviter_id: user.id,
    invitee_id: inviteeId,
    kind: 'invite',
  })

  if (error) {
    return {
      error: toErrorKey('sendInvite', error, { [DB_CODES.uniqueViolation]: 'invitePending' }),
    }
  }

  revalidatePath(`/classes/${pod.class_id}`)
  return { error: null }
}

export async function requestToJoin(podId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data: pod, error: podError } = await supabase
    .from('pairings')
    .select('class_id')
    .eq('id', podId)
    .single()

  if (podError || !pod) {
    if (podError) logServerError('requestToJoin.findPod', podError)
    return { error: 'podNotFound' }
  }

  if (await activePodInClass(supabase, pod.class_id, user.id)) {
    return { error: 'alreadyInPod' }
  }

  const { error } = await supabase.from('pod_invitations').insert({
    pod_id: podId,
    class_id: pod.class_id,
    inviter_id: user.id,
    invitee_id: user.id,
    kind: 'request',
  })

  if (error) {
    return {
      error: toErrorKey('requestToJoin', error, { [DB_CODES.uniqueViolation]: 'requestPending' }),
    }
  }

  revalidatePath(`/classes/${pod.class_id}`)
  return { error: null }
}

export async function acceptInvitation(invitationId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from('pod_invitations')
    .select('pod_id, class_id, kind')
    .eq('id', invitationId)
    .single()

  if (fetchError || !invitation) {
    if (fetchError) logServerError('acceptInvitation.find', fetchError)
    return { error: 'invitationNotFound' }
  }

  const { count } = await supabase
    .from('pairing_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('pairing_id', invitation.pod_id)

  if ((count ?? 0) >= POD_SOFT_CAP) {
    return { error: 'podFull' }
  }

  const { error } = await supabase.rpc('accept_pod_invitation', {
    target_invitation: invitationId,
  })

  if (error) {
    // One pod per class (0012): accepting an invite means *you* are already
    // in a pod; approving a request means the person asking is.
    const inPod = invitation.kind === 'invite' ? 'alreadyInPod' : 'inviteeInPod'
    return {
      error: toErrorKey('acceptInvitation', error, { [DB_CODES.onePodPerClass]: inPod }),
    }
  }

  revalidatePath(`/classes/${invitation.class_id}`)
  revalidatePath('/')
  return { error: null }
}

export async function declineInvitation(invitationId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from('pod_invitations')
    .select('class_id')
    .eq('id', invitationId)
    .single()

  if (fetchError || !invitation) {
    if (fetchError) logServerError('declineInvitation.find', fetchError)
    return { error: 'invitationNotFound' }
  }

  const { error } = await supabase
    .from('pod_invitations')
    .update({ status: 'declined' })
    .eq('id', invitationId)

  if (error) {
    return { error: toErrorKey('declineInvitation', error) }
  }

  revalidatePath(`/classes/${invitation.class_id}`)
  return { error: null }
}
