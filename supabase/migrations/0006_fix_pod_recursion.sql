-- =============================================================================
-- 0005_fix_pod_recursion.sql — Eliminate mutually-recursive pod RLS policies
-- =============================================================================
--
-- BUG (found by SQL impersonation testing, Sprint 2 — the second layer of the
-- same category 0004 began fixing):
--
--   Two SELECT policies read each other's tables via inline subqueries:
--     * pairings."read own pairings"        reads pairing_members
--     * pairing_members."read pod members in my classes" reads pairings
--   Reading pairings evaluates its policy -> reads pairing_members -> evaluates
--   ITS policy -> reads pairings -> ... => 42P17 infinite recursion.
--
--   Like 0004, this compiled, passed CI, and worked as the table owner (RLS
--   bypassed). It only fires under real per-user RLS evaluation.
--
-- FIX: route both through SECURITY DEFINER helpers, which run with the definer's
-- rights and do NOT re-invoke the caller's RLS — breaking the cycle. Same pattern
-- as is_podmate / is_pod_member / is_class_member.
-- =============================================================================


-- Does a given pod belong to a class the current user is in? (RLS-safe)
create or replace function public.pod_in_my_class(target_pod uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from pairings p
    join class_memberships cm on cm.class_id = p.class_id
    where p.id = target_pod
      and cm.user_id = auth.uid()
  );
$$;


-- --- pairings: "read own pairings" -------------------------------------------
-- Was: inline EXISTS on pairing_members (recursed with the policy below).
-- is_pod_member() is SECURITY DEFINER, so it does not re-trigger RLS.
drop policy if exists "read own pairings" on public.pairings;
create policy "read own pairings"
  on public.pairings for select
  using ( public.is_pod_member(id) );


-- --- pairing_members: "read pod members in my classes" -----------------------
-- Was: inline subquery joining pairings + class_memberships (recursed with the
-- policy above). Route through the definer helper instead.
drop policy if exists "read pod members in my classes" on public.pairing_members;
create policy "read pod members in my classes"
  on public.pairing_members for select
  using ( public.pod_in_my_class(pairing_id) );


-- =============================================================================
-- VERIFY (impersonate a real user — NOT postgres):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   select * from pairings;          -- no 42P17
--   select * from pairing_members;   -- no 42P17
--   commit;
-- =============================================================================
