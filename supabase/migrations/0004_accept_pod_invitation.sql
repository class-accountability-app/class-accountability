-- =============================================================================
-- 0004_accept_pod_invitation.sql — atomic accept for pod_invitations
-- =============================================================================
--
-- PROBLEM: pairing_members has exactly one INSERT policy (0003, "join a pod as
-- yourself"): with check (user_id = auth.uid()). That's correct for accepting an
-- INVITE — the invitee accepts as themselves, so a plain insert works. It is NOT
-- enough for accepting a REQUEST: there, the person clicking "accept" is an
-- existing pod member approving someone ELSE's request, and RLS correctly
-- refuses to let them insert a row for another user's id.
--
-- FIX: a SECURITY DEFINER function that re-validates authorization itself (the
-- same rules the RLS policies already express — same pattern as is_podmate /
-- is_pod_member) and then performs the status update + pairing_members insert
-- as one atomic operation. Authorization still lives in the database; this
-- function just runs from a context that's allowed to write another user's
-- membership row, after checking it's allowed to.
--
-- The soft 6-member cap stays application logic only (deliberate — see actions
-- file): this function does NOT enforce it. The server action checks the count
-- before calling this function. That is a known non-atomic race — two accepts
-- landing at the same instant could both pass the app-level check and push a
-- pod past 6. Acceptable for a soft cap on a 7-week solo capstone; a hard cap
-- would need the check moved in here under the same row lock.
-- =============================================================================

create or replace function public.accept_pod_invitation(target_invitation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  select id, pod_id, invitee_id, kind, status
  into inv
  from pod_invitations
  where id = target_invitation
  for update;

  if not found then
    raise exception 'invitation not found';
  end if;

  if inv.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  if inv.kind = 'invite' then
    if inv.invitee_id <> auth.uid() then
      raise exception 'not authorized to accept this invitation';
    end if;
  elsif inv.kind = 'request' then
    if not public.is_pod_member(inv.pod_id) then
      raise exception 'not authorized to accept this request';
    end if;
  else
    raise exception 'unknown invitation kind';
  end if;

  update pod_invitations set status = 'accepted' where id = target_invitation;

  insert into pairing_members (pairing_id, user_id)
  values (inv.pod_id, inv.invitee_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.accept_pod_invitation(uuid) to authenticated;


-- =============================================================================
-- VERIFY
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='pod_invitations';   -- unaffected, still true
--
-- Real test: as a pod member B, call accept_pod_invitation on a pending
-- 'request' row from user C (who is NOT B and NOT already in the pod). Confirm
-- C ends up in pairing_members and the invitation flips to 'accepted'. Then
-- confirm a non-member D calling it on the same (now non-pending) row raises.
-- =============================================================================
