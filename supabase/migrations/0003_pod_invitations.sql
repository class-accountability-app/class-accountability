-- =============================================================================
-- 0003_pod_invitations.sql — Invitation-based pod formation
-- =============================================================================
--
-- PIVOT (see Decision Log): pods no longer form by auto-matching. Instead:
--   - Anyone in a class can CREATE a pod.
--   - A pod member can INVITE another classmate ('invite').
--   - A classmate can REQUEST to join an existing pod ('request').
--   - The other side ACCEPTS, which adds the person to pairing_members.
--   - Soft size cap (~6) enforced in application logic on accept, not as a hard
--     DB constraint (so "soft" stays soft and is easy to tune).
--
-- This migration adds ONE table (pod_invitations) and the RLS needed for
-- PRE-membership visibility: you must be able to see a pod exists to request to
-- join it, and see an invitation addressed to you before you've accepted —
-- which the existing member-only policies from 0001 do not allow.
--
-- Every table here has RLS enabled (CI enforces this).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- pod_invitations — both directions of joining, in one table
--
-- kind = 'invite'  : inviter_id (a pod member) invites invitee_id (a classmate)
-- kind = 'request' : invitee_id asks to join; inviter_id is the same person
--                    (they are requesting on their own behalf)
--
-- Modelling both as one table keeps the accept flow uniform: accepting any
-- pending row adds `invitee_id` to the pod.
-- -----------------------------------------------------------------------------
create table public.pod_invitations (
  id          uuid primary key default gen_random_uuid(),
  pod_id      uuid not null references public.pairings(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  invitee_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('invite', 'request')),
  status      text not null default 'pending'
              check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),

  -- Can't have two live invitations for the same person to the same pod.
  unique (pod_id, invitee_id, status)
);

alter table public.pod_invitations enable row level security;

create index on public.pod_invitations (invitee_id, status);
create index on public.pod_invitations (pod_id);
create index on public.pod_invitations (class_id);


-- =============================================================================
-- HELPER: am I a member of this pod?
--
-- Used by several policies below. SECURITY DEFINER + locked search_path so a
-- policy on pairing_members can query pairing_members without recursing.
-- =============================================================================
create or replace function public.is_pod_member(target_pod uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from pairing_members pm
    where pm.pairing_id = target_pod
      and pm.user_id = auth.uid()
  );
$$;


-- =============================================================================
-- NEW POLICIES ON EXISTING TABLES — pre-membership visibility
--
-- 0001 let you see a pod / its members only if you were already in it. Invitations
-- need more: you must be able to discover pods in your class (to request to join),
-- and — once you accept — insert yourself into pairing_members.
-- =============================================================================

-- See any pod that belongs to a class you're a member of (needed to request to join).
create policy "read pods in my classes"
  on public.pairings for select
  using (
    exists (
      select 1 from public.class_memberships cm
      where cm.class_id = pairings.class_id
        and cm.user_id = auth.uid()
    )
  );

-- Anyone in a class can create a pod in that class.
create policy "create pods in my classes"
  on public.pairings for insert
  with check (
    exists (
      select 1 from public.class_memberships cm
      where cm.class_id = pairings.class_id
        and cm.user_id = auth.uid()
    )
  );

-- See the members of any pod in a class you're in (needed to show pod rosters
-- before you've joined — e.g. "this pod has 3 people" when deciding to request).
create policy "read pod members in my classes"
  on public.pairing_members for select
  using (
    exists (
      select 1
      from public.pairings p
      join public.class_memberships cm on cm.class_id = p.class_id
      where p.id = pairing_members.pairing_id
        and cm.user_id = auth.uid()
    )
  );

-- You can add YOURSELF to a pod (this is what "accept" does). The application
-- checks the soft cap and that a matching accepted invitation exists before
-- calling this; RLS guarantees you can only ever insert your own membership.
create policy "join a pod as yourself"
  on public.pairing_members for insert
  with check (user_id = auth.uid());


-- =============================================================================
-- POLICIES ON pod_invitations
-- =============================================================================

-- You can see an invitation if you're involved in it (either side), OR if you're
-- already a member of the pod it targets (so pod members see incoming requests).
create policy "read invitations i'm party to"
  on public.pod_invitations for select
  using (
    inviter_id = auth.uid()
    or invitee_id = auth.uid()
    or public.is_pod_member(pod_id)
  );

-- Sending an INVITE: you must be a member of the pod, and the invitee must be a
-- classmate. You send as yourself.
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

-- Sending a REQUEST to join: you request on your own behalf (inviter = invitee =
-- you), and you must be a member of the class the pod belongs to.
create policy "request to join a pod"
  on public.pod_invitations for insert
  with check (
    kind = 'request'
    and inviter_id = auth.uid()
    and invitee_id = auth.uid()
    and exists (
      select 1 from public.class_memberships cm
      where cm.class_id = pod_invitations.class_id
        and cm.user_id = auth.uid()
    )
  );

-- Updating an invitation's status (accept/decline). Who may act depends on kind:
--   - an 'invite' is accepted/declined by the INVITEE
--   - a 'request' is accepted/declined by an existing POD MEMBER
-- The USING clause gates who can act; the app sets status to accepted/declined.
create policy "act on an invitation"
  on public.pod_invitations for update
  using (
    (kind = 'invite'  and invitee_id = auth.uid())
    or
    (kind = 'request' and public.is_pod_member(pod_id))
  )
  with check (
    (kind = 'invite'  and invitee_id = auth.uid())
    or
    (kind = 'request' and public.is_pod_member(pod_id))
  );


-- =============================================================================
-- VERIFY
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='pod_invitations';   -- must be true
--
-- Then the real test (Sprint 2): with TWO accounts, confirm A can invite B,
-- B sees and accepts the invite, B lands in the pod, and a THIRD account not in
-- the class cannot see the pod, its members, or the invitation.
-- =============================================================================
