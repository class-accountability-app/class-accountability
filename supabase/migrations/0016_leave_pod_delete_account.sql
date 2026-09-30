-- =============================================================================
-- 0016_leave_pod_delete_account.sql — leave a pod; delete your own account
-- =============================================================================
--
-- 1. leave_pod(pod): removes only the caller's pairing_members row, deletes the
--    caller's pending invites for that pod (a cancelled invite is simply
--    gone), and deletes the pod once it is empty; its invitations and nudges
--    cascade. Nudges in a pod that still has members stay, as history. The
--    caller can then start or join another pod in the class; the one-pod
--    trigger (0012) still applies.
--
-- 2. delete_my_account(): deletes auth.users where id = auth.uid(); profiles and
--    everything that belongs to the student cascade from there (memberships,
--    pod rows, targets, logs, comments they wrote and comments on their logs,
--    nudges sent or received, invitations on either side). An organizer of a
--    class that still has students can't (SP004); an organizer's classes
--    without students go with the account. Pods left empty are removed.
--    postgres owns the function, has DELETE on auth.users and bypasses RLS;
--    authenticated has no privilege on auth.users, so this is the only way in.
--    No service_role key is involved.
--
-- No new tables, so no new RLS to enable.
-- Tests: supabase/tests/rls_leave_pod_delete_account.sql.
-- =============================================================================


-- =============================================================================
-- 1. LEAVE A POD
-- =============================================================================

create or replace function public.leave_pod(target_pod uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Serializes with other leaves of this pod and with joins (a new member's
  -- FK check takes KEY SHARE on the pod row, which FOR UPDATE blocks), so the
  -- "is it empty now?" check below can't race.
  perform 1 from pairings where id = target_pod for update;

  delete from pairing_members where pairing_id = target_pod and user_id = me;
  if not found then
    raise exception 'not a member of this pod' using errcode = '42501';
  end if;

  -- Invites I sent for this pod are cancelled (pending only; history stays).
  delete from pod_invitations
  where pod_id = target_pod
    and kind = 'invite'
    and inviter_id = me
    and status = 'pending';

  -- The last one out removes the pod; its invitations and nudges cascade.
  if not exists (select 1 from pairing_members where pairing_id = target_pod) then
    delete from pairings where id = target_pod;
  end if;
end;
$$;

revoke execute on function public.leave_pod(uuid) from public, anon;
grant execute on function public.leave_pod(uuid) to authenticated;


-- =============================================================================
-- 2. DELETE MY ACCOUNT
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me constant uuid := auth.uid();
  my_pods uuid[];
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Lock the classes I organize first, so nobody can join one (the new
  -- membership's FK check needs KEY SHARE) between the check and the delete.
  perform 1
  from classes c
  join class_memberships mine on mine.class_id = c.id
  where mine.user_id = me and mine.role = 'organizer'
  for update of c;

  if exists (
    select 1
    from class_memberships mine
    join class_memberships s on s.class_id = mine.class_id and s.role = 'student'
    where mine.user_id = me and mine.role = 'organizer'
  ) then
    raise exception 'organizer of a class with students' using errcode = 'SP004';
  end if;

  -- My organized classes have no students (checked above); nobody could
  -- manage them afterwards, so they go too.
  delete from classes c
  using class_memberships mine
  where mine.class_id = c.id and mine.user_id = me and mine.role = 'organizer';

  select coalesce(array_agg(pairing_id), '{}') into my_pods
  from pairing_members where user_id = me;

  perform 1 from pairings where id = any (my_pods) order by id for update;

  -- Everything that belongs to me cascades from here (profiles and onwards).
  delete from auth.users where id = me;

  -- Pods I was the last member of.
  delete from pairings p
  where p.id = any (my_pods)
    and not exists (select 1 from pairing_members pm where pm.pairing_id = p.id);
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- =============================================================================
-- VERIFY
--   select proname, has_function_privilege('anon', oid, 'execute') as anon
--   from pg_proc where proname in ('leave_pod', 'delete_my_account');  -- anon false
-- Then run supabase/tests/rls_leave_pod_delete_account.sql and the five older files.
-- =============================================================================
