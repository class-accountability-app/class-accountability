-- =============================================================================
-- rls_class_organizers.sql — RLS tests for 0015 (organizers, tidy-up)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class,
-- a pod, a target, a log and a comment, impersonates each user the way
-- PostgREST does (role + JWT claims), and checks what the database allows.
-- Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   O  — approved (can_create_classes); creates class K and organizes it
--   U  — not approved
--   S1 — student in K: starts a pod, sets a target, logs, comments
--   S2 — student in K
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000002a1', 'rls-test-org@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000002b2', 'rls-test-unapproved@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000002c3', 'rls-test-s1@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000002d4', 'rls-test-s2@andrew.ac.jp', 'authenticated', 'authenticated');

update public.profiles set can_create_classes = true
where id = '00000000-0000-4000-8000-0000000002a1';

do $$
begin
  if (select count(*) from public.profiles
      where id::text like '00000000-0000-4000-8000-0000000002%' and can_create_classes) <> 1 then
    raise exception 'FAIL: new accounts should not be approved by default';
  end if;
end $$;


-- =============================================================================
-- As U (not approved): can't create a class
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002b2","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    insert into public.classes (name, university, term, created_by)
    values ('RLS test class by U', 'Test', 'test', '00000000-0000-4000-8000-0000000002b2');
    raise exception 'FAIL: an unapproved account created a class';
  exception when insufficient_privilege then null;
  end;

  -- ...and can't approve itself.
  begin
    update public.profiles set can_create_classes = true
    where id = '00000000-0000-4000-8000-0000000002b2';
    raise exception 'FAIL: a student set can_create_classes';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As O (approved): creates class K and becomes its organizer
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  o constant uuid := '00000000-0000-4000-8000-0000000002a1';
  k uuid;
begin
  insert into public.classes (name, university, term, created_by)
  values ('RLS test class K', 'Test', 'test', o)
  returning id into k;

  if (select role from public.class_memberships where class_id = k and user_id = o) is distinct from 'organizer' then
    raise exception 'FAIL: the creator did not become the organizer';
  end if;

  perform set_config('rls_test.k', k::text, true);
  perform set_config('rls_test.k_code', (select join_code from public.classes where id = k), true);
end $$;

reset role;


-- =============================================================================
-- As S1 and S2: join K by code (as students), S1 starts a pod and logs work
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  s1 constant uuid := '00000000-0000-4000-8000-0000000002c3';
  k constant uuid := current_setting('rls_test.k')::uuid;
  pod uuid;
  tgt uuid;
  lg uuid;
begin
  if public.join_class_by_code(current_setting('rls_test.k_code')) is distinct from k then
    raise exception 'FAIL: S1 could not join K by code';
  end if;
  if (select role from public.class_memberships where class_id = k and user_id = s1) <> 'student' then
    raise exception 'FAIL: joining by code did not make S1 a student';
  end if;

  pod := public.create_pod(k);
  perform set_config('rls_test.pod', pod::text, true);

  insert into public.targets (user_id, class_id, title, target_type, target_amount)
  values (s1, k, 'S1 report', 'character_count', 2000) returning id into tgt;
  insert into public.progress_logs (user_id, target_id, progress_value)
  values (s1, tgt, 300) returning id into lg;
  insert into public.progress_comments (progress_log_id, author_id, body)
  values (lg, s1, 'note to self');
  perform set_config('rls_test.target', tgt::text, true);

  -- --- a student can't change their own role or approve themselves -----------
  update public.class_memberships set role = 'organizer' where user_id = s1 and class_id = k;
  if (select role from public.class_memberships where class_id = k and user_id = s1) <> 'student' then
    raise exception 'FAIL: S1 made themselves an organizer';
  end if;
  begin
    update public.profiles set can_create_classes = true where id = s1;
    raise exception 'FAIL: S1 set can_create_classes';
  exception when insufficient_privilege then null;
  end;

  -- --- the organizer is invisible to students -------------------------------
  if exists (select 1 from public.class_memberships where class_id = k and role = 'organizer') then
    raise exception 'FAIL: S1 can see the organizer''s membership';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000002a1') then
    raise exception 'FAIL: S1 can see the organizer''s profile';
  end if;

  -- --- ...and can't be invited -------------------------------------------------
  begin
    insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind)
    values (pod, k, s1, '00000000-0000-4000-8000-0000000002a1', 'invite');
    raise exception 'FAIL: S1 invited the organizer to a pod';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002d4","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.join_class_by_code(current_setting('rls_test.k_code'));
  if (select count(*) from public.profiles
      where id in ('00000000-0000-4000-8000-0000000002c3', '00000000-0000-4000-8000-0000000002d4')) <> 2 then
    raise exception 'FAIL: students should still see each other''s names';
  end if;
end $$;

reset role;

-- For the accept test below: an invite to the organizer, made as the owner
-- (the policy above refuses it for a student).
insert into public.pod_invitations (id, pod_id, class_id, inviter_id, invitee_id, kind)
values ('00000000-0000-4000-8000-0000000002f1', current_setting('rls_test.pod')::uuid,
        current_setting('rls_test.k')::uuid, '00000000-0000-4000-8000-0000000002c3',
        '00000000-0000-4000-8000-0000000002a1', 'invite');


-- =============================================================================
-- As O (organizer of K): sees the class, never the students' work
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  o constant uuid := '00000000-0000-4000-8000-0000000002a1';
  k constant uuid := current_setting('rls_test.k')::uuid;
  pod constant uuid := current_setting('rls_test.pod')::uuid;
  r record;
begin
  if not exists (select 1 from public.classes where id = k) then
    raise exception 'FAIL: the organizer cannot see their class';
  end if;

  -- --- the member count is students only ----------------------------------------
  select * into r from public.class_by_join_code(current_setting('rls_test.k_code'));
  if r.member_count <> 2 or not r.is_member then
    raise exception 'FAIL: class_by_join_code for the organizer returned %', r;
  end if;

  -- --- joining by code again never changes the organizer's role -------------------
  perform public.join_class_by_code(current_setting('rls_test.k_code'));
  if (select role from public.class_memberships where class_id = k and user_id = o) <> 'organizer' then
    raise exception 'FAIL: joining by code changed the organizer''s role';
  end if;

  -- --- no pods ---------------------------------------------------------------------
  begin
    perform public.create_pod(k);
    raise exception 'FAIL: the organizer created a pod';
  exception when sqlstate 'SP003' then null;
  end;

  begin
    insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind)
    values (pod, k, o, o, 'request');
    raise exception 'FAIL: the organizer asked to join a pod';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.accept_pod_invitation('00000000-0000-4000-8000-0000000002f1');
    raise exception 'FAIL: the organizer accepted an invitation into a pod';
  exception when sqlstate 'SP003' then null;
  end;

  -- --- no targets --------------------------------------------------------------------
  begin
    insert into public.targets (user_id, class_id, title, target_type)
    values (o, k, 'organizer target', 'task');
    raise exception 'FAIL: the organizer created a target';
  exception when insufficient_privilege then null;
  end;

  -- --- nothing of the students: work, pods, memberships, names ------------------------
  if exists (select 1 from public.targets where user_id <> o) then
    raise exception 'FAIL: the organizer can see a student''s targets';
  end if;
  if exists (select 1 from public.progress_logs) then
    raise exception 'FAIL: the organizer can see progress logs';
  end if;
  if exists (select 1 from public.progress_comments) then
    raise exception 'FAIL: the organizer can see comments';
  end if;
  if exists (select 1 from public.pairings) or exists (select 1 from public.pairing_members) then
    raise exception 'FAIL: the organizer can see pods';
  end if;
  if (select count(*) from public.class_memberships where class_id = k) <> 1 then
    raise exception 'FAIL: the organizer should see only their own membership';
  end if;
  if exists (select 1 from public.profiles where id <> o) then
    raise exception 'FAIL: the organizer can see a student''s profile';
  end if;
end $$;

reset role;

-- The owner can't put an organizer into a pod either (trigger, not RLS).
do $$
begin
  begin
    insert into public.pairing_members (pairing_id, user_id)
    values (current_setting('rls_test.pod')::uuid, '00000000-0000-4000-8000-0000000002a1');
    raise exception 'FAIL: the organizer was added to a pod directly';
  exception when sqlstate 'SP003' then null;
  end;
end $$;


-- =============================================================================
-- Logged out (anon): no rows anywhere, no helpers
-- =============================================================================

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
begin
  if exists (select 1 from public.class_memberships)
     or exists (select 1 from public.profiles)
     or exists (select 1 from public.targets)
     or exists (select 1 from public.pairings) then
    raise exception 'FAIL: anon can read rows';
  end if;

  begin
    perform public.is_class_member(current_setting('rls_test.k')::uuid);
    raise exception 'FAIL: anon can call is_class_member';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.accept_pod_invitation('00000000-0000-4000-8000-0000000002f1');
    raise exception 'FAIL: anon can call accept_pod_invitation';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'is_podmate') then
    raise exception 'FAIL: is_podmate still exists';
  end if;
  if exists (select 1 from pg_policy pol
             join pg_class c on c.oid = pol.polrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and pol.polroles = '{0}') then
    raise exception 'FAIL: a policy still applies to all roles';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
