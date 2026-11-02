-- =============================================================================
-- 0039_swap_students.sql — the organizer swaps two students between teams
-- (the author's ask of 2026-11-02; needs 0036)
-- =============================================================================
--
-- organizer_move_student (0036) can't put a student into a full team (6),
-- even when someone from that team would go the other way. A swap does both
-- moves in one step: the two students change teams and both teams keep their
-- size, so the cap of 6 is never in question.
--
-- Rules (checked here; the 0012/0015 triggers still enforce one team per class
-- and students only): the caller is the class's organizer (42501); both are
-- students in active teams of this class, in two different teams (SP017).
-- Their pending invitations they sent for their old team are deleted, as in
-- place_student. Leaving a team unassigns the leaver's tasks there (0022's
-- trigger) and keeps their numbers, as with any move.
-- Test: supabase/tests/rls_swap_students.sql.
-- =============================================================================

create or replace function public.organizer_swap_students(p_class uuid, p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pod_a uuid;
  pod_b uuid;
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer can swap students' using errcode = '42501';
  end if;

  select pm.pairing_id into pod_a
  from pairing_members pm join pairings p on p.id = pm.pairing_id
  where pm.user_id = p_a and p.class_id = p_class and p.status = 'active';
  select pm.pairing_id into pod_b
  from pairing_members pm join pairings p on p.id = pm.pairing_id
  where pm.user_id = p_b and p.class_id = p_class and p.status = 'active';

  if pod_a is null or pod_b is null or pod_a = pod_b then
    raise exception 'both students must be in two different teams of this class' using errcode = 'SP017';
  end if;

  -- Lock both teams in a fixed order so two swaps can't deadlock.
  perform 1 from pairings where id in (pod_a, pod_b) order by id for update;

  delete from pairing_members where pairing_id = pod_a and user_id = p_a;
  delete from pairing_members where pairing_id = pod_b and user_id = p_b;
  delete from pod_invitations
  where status = 'pending' and kind = 'invite'
    and ((pod_id = pod_a and inviter_id = p_a) or (pod_id = pod_b and inviter_id = p_b));

  insert into pairing_members (pairing_id, user_id) values (pod_b, p_a), (pod_a, p_b);
end;
$$;

revoke execute on function public.organizer_swap_students(uuid, uuid, uuid) from public, anon;
grant execute on function public.organizer_swap_students(uuid, uuid, uuid) to authenticated;
