-- =============================================================================
-- 0004_fix_membership_recursion.sql — Fix infinite recursion in RLS
-- =============================================================================
--
-- BUG (found by SQL impersonation testing, Sprint 2):
--   The class_memberships SELECT policy from 0001 ("read memberships of my
--   classes") checks whether you're in a class by running a SUBQUERY on
--   class_memberships itself. When the policy evaluates, that subquery re-triggers
--   the same policy, which re-runs the subquery... Postgres aborts with
--   42P17: infinite recursion detected in policy for relation "class_memberships".
--
--   This did not surface earlier because the table owner (postgres/dashboard)
--   bypasses RLS, and app queries hadn't exercised the recursive path as a real
--   authenticated user. It would have failed the moment a second real user
--   loaded a class page.
--
-- FIX:
--   Move the "is this user in this class?" check into a SECURITY DEFINER function.
--   A SECURITY DEFINER function runs with the definer's privileges and does NOT
--   re-invoke the caller's RLS policies, breaking the recursion. This is the same
--   pattern already used successfully by is_podmate() and is_pod_member().
-- =============================================================================


-- Is the current user a member of this class? (RLS-safe)
create or replace function public.is_class_member(target_class uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from class_memberships cm
    where cm.class_id = target_class
      and cm.user_id = auth.uid()
  );
$$;


-- Replace the recursive policy on class_memberships.
drop policy if exists "read memberships of my classes" on public.class_memberships;

create policy "read memberships of my classes"
  on public.class_memberships for select
  using ( public.is_class_member(class_id) );


-- While we're here: the same recursive shape exists in several policies added in
-- 0003 that inline `select 1 from class_memberships ... where user_id = auth.uid()`.
-- Those query class_memberships from policies on OTHER tables (pairings,
-- pairing_members, pod_invitations), so they don't self-recurse — but routing them
-- through the same helper is cleaner and centralises the rule. Rewrite them to use
-- is_class_member().

-- pairings: read / create pods in my classes
drop policy if exists "read pods in my classes" on public.pairings;
create policy "read pods in my classes"
  on public.pairings for select
  using ( public.is_class_member(class_id) );

drop policy if exists "create pods in my classes" on public.pairings;
create policy "create pods in my classes"
  on public.pairings for insert
  with check ( public.is_class_member(class_id) );

-- pod_invitations: request to join (must be in the class)
drop policy if exists "request to join a pod" on public.pod_invitations;
create policy "request to join a pod"
  on public.pod_invitations for insert
  with check (
    kind = 'request'
    and inviter_id = auth.uid()
    and invitee_id = auth.uid()
    and public.is_class_member(class_id)
  );

-- pod_invitations: send an invite (inviter in class implicitly via pod membership;
-- invitee must be a class member)
drop policy if exists "send an invite" on public.pod_invitations;
create policy "send an invite"
  on public.pod_invitations for insert
  with check (
    kind = 'invite'
    and inviter_id = auth.uid()
    and public.is_pod_member(pod_id)
    and exists (
      select 1 from public.class_memberships cm
      where cm.class_id = pod_invitations.class_id
        and cm.user_id = invitee_id
    )
  );
-- NOTE: the invitee check above intentionally stays an inline subquery: it tests
-- membership of the INVITEE (not the current user), which is_class_member() —
-- keyed to auth.uid() — cannot express. It does not recurse because it runs from a
-- policy on pod_invitations, not on class_memberships.


-- =============================================================================
-- VERIFY (run as a real user via impersonation, not as postgres):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<a-user-uuid>","role":"authenticated"}';
--   select * from class_memberships;   -- must return WITHOUT the 42P17 recursion error
--   commit;
-- =============================================================================
