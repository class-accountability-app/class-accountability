'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DB_CODES, logServerError, toErrorKey, type ActionResult } from '@/lib/errors'

// Soft cap only — no DB constraint (see 0003 decision log). Checked here, not
// enforced atomically; see 0004's comment on the accept race.
const POD_SOFT_CAP = 6

export async function createPod(classId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'signedOut' }
  }

  const { data: pod, error } = await supabase
    .from('pairings')
    .insert({ class_id: classId })
    .select('id')
    .single()

  if (error) {
    return { error: toErrorKey('createPod', error) }
  }

  const { error: memberError } = await supabase
    .from('pairing_members')
    .insert({ pairing_id: pod.id, user_id: user.id })

  if (memberError) {
    return { error: toErrorKey('createPod.addMember', memberError) }
  }

  revalidatePath(`/classes/${classId}`)
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
    .select('pod_id, class_id')
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
    return { error: toErrorKey('acceptInvitation', error) }
  }

  revalidatePath(`/classes/${invitation.class_id}`)
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
