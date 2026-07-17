'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const UNIQUE_VIOLATION = '23505'

// Soft cap only — no DB constraint (see 0003 decision log). Checked here, not
// enforced atomically; see 0004's comment on the accept race.
const POD_SOFT_CAP = 6

export async function createPod(classId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: pod, error } = await supabase
    .from('pairings')
    .insert({ class_id: classId })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  const { error: memberError } = await supabase
    .from('pairing_members')
    .insert({ pairing_id: pod.id, user_id: user.id })

  if (memberError) {
    return { error: memberError.message }
  }

  revalidatePath(`/classes/${classId}`)
  return { error: null }
}

export async function sendInvite(podId: string, inviteeId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: pod, error: podError } = await supabase
    .from('pairings')
    .select('class_id')
    .eq('id', podId)
    .single()

  if (podError || !pod) {
    return { error: 'Pod not found.' }
  }

  const { error } = await supabase.from('pod_invitations').insert({
    pod_id: podId,
    class_id: pod.class_id,
    inviter_id: user.id,
    invitee_id: inviteeId,
    kind: 'invite',
  })

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: 'An invitation to this person is already pending.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/classes/${pod.class_id}`)
  return { error: null }
}

export async function requestToJoin(podId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: pod, error: podError } = await supabase
    .from('pairings')
    .select('class_id')
    .eq('id', podId)
    .single()

  if (podError || !pod) {
    return { error: 'Pod not found.' }
  }

  const { error } = await supabase.from('pod_invitations').insert({
    pod_id: podId,
    class_id: pod.class_id,
    inviter_id: user.id,
    invitee_id: user.id,
    kind: 'request',
  })

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: 'You already have a pending request for this pod.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/classes/${pod.class_id}`)
  return { error: null }
}

export async function acceptInvitation(invitationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from('pod_invitations')
    .select('pod_id, class_id')
    .eq('id', invitationId)
    .single()

  if (fetchError || !invitation) {
    return { error: 'Invitation not found.' }
  }

  const { count } = await supabase
    .from('pairing_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('pairing_id', invitation.pod_id)

  if ((count ?? 0) >= POD_SOFT_CAP) {
    return { error: 'This pod is full.' }
  }

  const { error } = await supabase.rpc('accept_pod_invitation', {
    target_invitation: invitationId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/classes/${invitation.class_id}`)
  return { error: null }
}

export async function declineInvitation(invitationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from('pod_invitations')
    .select('class_id')
    .eq('id', invitationId)
    .single()

  if (fetchError || !invitation) {
    return { error: 'Invitation not found.' }
  }

  const { error } = await supabase
    .from('pod_invitations')
    .update({ status: 'declined' })
    .eq('id', invitationId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/classes/${invitation.class_id}`)
  return { error: null }
}
