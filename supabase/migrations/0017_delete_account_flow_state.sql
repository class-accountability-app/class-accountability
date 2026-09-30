-- =============================================================================
-- 0017_delete_account_flow_state.sql — delete_my_account also clears
-- auth.flow_state
-- =============================================================================
--
-- auth.flow_state (Supabase Auth's PKCE login state) has a user_id column but
-- no foreign key to auth.users, so 0016's "delete from auth.users" left a
-- deleted student's rows behind, and Supabase doesn't clean them up. Now the
-- function deletes them first. Everything else is exactly as in 0016:
-- security definer, search_path, the SP004 check, the organizer's classes
-- without students, pods left empty, and the grants.
--
-- (auth.refresh_tokens.user_id is text with no FK either, but its rows cascade
-- through session_id when auth.sessions goes, so it needs nothing here.)
--
-- Rows left by accounts deleted before this migration are removed once, by
-- hand (see the PR), not here.
--
-- No new tables. Tests: supabase/tests/rls_leave_pod_delete_account.sql.
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

  -- Supabase Auth's login state has no foreign key to auth.users, so it
  -- doesn't cascade; delete my rows explicitly.
  delete from auth.flow_state where user_id = me;

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
--   select prosrc like '%auth.flow_state%' from pg_proc
--   where oid = 'public.delete_my_account()'::regprocedure;           -- true
-- Then run supabase/tests/rls_leave_pod_delete_account.sql and the five older files.
-- =============================================================================
