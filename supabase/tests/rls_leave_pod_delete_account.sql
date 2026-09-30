-- =============================================================================
-- rls_leave_pod_delete_account.sql — tests for 0016 and 0017 (leave_pod, delete_my_account)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, classes,
-- pods, targets, logs, comments, nudges and invitations, impersonates each
-- user the way PostgREST does (role + JWT claims), and checks what the two
-- functions do. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — students in class K, together in pod P1
--   C, D, E — students in K; A invites C, B invites D, E asks to join P1
--   O  — organizer of K3, which has a student (D)
--   O2 — organizer of K4, which has no students
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000003a1', 'rls-test-leave-a@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003b2', 'rls-test-leave-b@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003c3', 'rls-test-leave-c@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003d4', 'rls-test-leave-d@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003e5', 'rls-test-leave-e@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003f6', 'rls-test-leave-o@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000307', 'rls-test-leave-o2@andrew.ac.jp', 'authenticated', 'authenticated');

-- Owner inserts add no organizer (auth.uid() is null here, see 0015).
insert into public.classes (id, name, university, term) values
  ('00000000-0000-4000-8000-00000000c301', 'RLS test class K', 'Test', 'test'),
  ('00000000-0000-4000-8000-00000000c302', 'RLS test class K2', 'Test', 'test'),
  ('00000000-0000-4000-8000-00000000c303', 'RLS test class K3', 'Test', 'test'),
  ('00000000-0000-4000-8000-00000000c304', 'RLS test class K4', 'Test', 'test');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-00000000c301', 'student'),
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-00000000c301', 'student'),
  ('00000000-0000-4000-8000-0000000003c3', '00000000-0000-4000-8000-00000000c301', 'student'),
  ('00000000-0000-4000-8000-0000000003d4', '00000000-0000-4000-8000-00000000c301', 'student'),
  ('00000000-0000-4000-8000-0000000003e5', '00000000-0000-4000-8000-00000000c301', 'student'),
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-00000000c302', 'student'),
  ('00000000-0000-4000-8000-0000000003f6', '00000000-0000-4000-8000-00000000c303', 'organizer'),
  ('00000000-0000-4000-8000-0000000003d4', '00000000-0000-4000-8000-00000000c303', 'student'),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-00000000c304', 'organizer');

-- P1 in K: A and B.
insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-000000003d01', '00000000-0000-4000-8000-00000000c301');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-000000003d01', '00000000-0000-4000-8000-0000000003a1'),
  ('00000000-0000-4000-8000-000000003d01', '00000000-0000-4000-8000-0000000003b2');

insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind) values
  -- A invites C, B invites D, E asks to join.
  ('00000000-0000-4000-8000-000000003d01', '00000000-0000-4000-8000-00000000c301',
   '00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000003c3', 'invite'),
  ('00000000-0000-4000-8000-000000003d01', '00000000-0000-4000-8000-00000000c301',
   '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003d4', 'invite'),
  ('00000000-0000-4000-8000-000000003d01', '00000000-0000-4000-8000-00000000c301',
   '00000000-0000-4000-8000-0000000003e5', '00000000-0000-4000-8000-0000000003e5', 'request');

insert into public.nudges (from_user_id, to_user_id, pairing_id, type) values
  ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000003b2',
   '00000000-0000-4000-8000-000000003d01', 'reaction'),
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1',
   '00000000-0000-4000-8000-000000003d01', 'reaction');


-- =============================================================================
-- Logged out: neither function can be called
-- =============================================================================

select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  begin
    perform public.leave_pod('00000000-0000-4000-8000-000000003d01');
    raise exception 'FAIL: anon called leave_pod';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.delete_my_account();
    raise exception 'FAIL: anon called delete_my_account';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As C (in the class, not in P1): can't leave a pod they aren't in
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000003c3","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    perform public.leave_pod('00000000-0000-4000-8000-000000003d01');
    raise exception 'FAIL: a non-member left P1';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.pairing_members
      where pairing_id = '00000000-0000-4000-8000-000000003d01') <> 2 then
    raise exception 'FAIL: a non-member''s leave_pod changed P1';
  end if;
end $$;


-- =============================================================================
-- As A: leaves P1; then starts a pod of their own and leaves that too
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000000c301';
  p1 constant uuid := '00000000-0000-4000-8000-000000003d01';
  p2 uuid;
begin
  perform public.leave_pod(p1);

  -- Leaving twice: not a member any more.
  begin
    perform public.leave_pod(p1);
    raise exception 'FAIL: A left P1 twice';
  exception when insufficient_privilege then null;
  end;

  -- Free to start a new pod in the class now...
  p2 := public.create_pod(k);

  -- ...and the one-pod rule still holds.
  begin
    perform public.create_pod(k);
    raise exception 'FAIL: A started a second pod in K';
  exception when sqlstate 'SP002' then null;
  end;

  -- The last one out: P2 disappears.
  perform public.leave_pod(p2);
  if exists (select 1 from public.pairings where id = p2) then
    raise exception 'FAIL: an empty pod was not removed';
  end if;
end $$;

reset role;

do $$
declare
  p1 constant uuid := '00000000-0000-4000-8000-000000003d01';
  a constant uuid := '00000000-0000-4000-8000-0000000003a1';
  b constant uuid := '00000000-0000-4000-8000-0000000003b2';
begin
  if exists (select 1 from public.pairing_members where pairing_id = p1 and user_id = a) then
    raise exception 'FAIL: A is still in P1';
  end if;
  if not exists (select 1 from public.pairing_members where pairing_id = p1 and user_id = b) then
    raise exception 'FAIL: leave_pod removed someone else''s row';
  end if;
  if exists (select 1 from public.pod_invitations where pod_id = p1 and inviter_id = a) then
    raise exception 'FAIL: A''s pending invite for P1 was not cancelled';
  end if;
  if (select count(*) from public.pod_invitations where pod_id = p1 and status = 'pending') <> 2 then
    raise exception 'FAIL: B''s invite or E''s request was touched when A left';
  end if;
  if (select count(*) from public.nudges where pairing_id = p1) <> 2 then
    raise exception 'FAIL: nudges in a pod that still has members were deleted';
  end if;
  if (select count(*) from public.pairings
      where class_id = '00000000-0000-4000-8000-00000000c301') <> 1 then
    raise exception 'FAIL: expected only P1 left in K';
  end if;
end $$;


-- =============================================================================
-- As B: the last one out of P1; it goes, with its invitations and nudges
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000003b2","role":"authenticated"}', true);
set local role authenticated;

select public.leave_pod('00000000-0000-4000-8000-000000003d01');

reset role;

do $$
declare
  p1 constant uuid := '00000000-0000-4000-8000-000000003d01';
begin
  if exists (select 1 from public.pairings where id = p1) then
    raise exception 'FAIL: P1 was not removed when empty';
  end if;
  if exists (select 1 from public.pod_invitations where pod_id = p1) then
    raise exception 'FAIL: invitations of a removed pod survived';
  end if;
  if exists (select 1 from public.nudges where pairing_id = p1) then
    raise exception 'FAIL: nudges of a removed pod survived';
  end if;
end $$;


-- --- Setup for account deletion ---------------------------------------------
-- P3 in K: B and C. P4 in K2: B alone. Targets, logs and comments for A, B, C.
-- B invites D to P3; E asks to join P3; nudges B↔C.

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-000000003d03', '00000000-0000-4000-8000-00000000c301'),
  ('00000000-0000-4000-8000-000000003d04', '00000000-0000-4000-8000-00000000c302');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-000000003d03', '00000000-0000-4000-8000-0000000003b2'),
  ('00000000-0000-4000-8000-000000003d03', '00000000-0000-4000-8000-0000000003c3'),
  ('00000000-0000-4000-8000-000000003d04', '00000000-0000-4000-8000-0000000003b2');

insert into public.targets (id, user_id, class_id, title, target_type, target_amount) values
  ('00000000-0000-4000-8000-000000003e01', '00000000-0000-4000-8000-0000000003a1',
   '00000000-0000-4000-8000-00000000c301', 'A target', 'study_hours', 10),
  ('00000000-0000-4000-8000-000000003e02', '00000000-0000-4000-8000-0000000003b2',
   '00000000-0000-4000-8000-00000000c301', 'B target', 'study_hours', 10),
  ('00000000-0000-4000-8000-000000003e03', '00000000-0000-4000-8000-0000000003c3',
   '00000000-0000-4000-8000-00000000c301', 'C target', 'study_hours', 10);

insert into public.progress_logs (id, user_id, target_id, progress_value) values
  ('00000000-0000-4000-8000-000000003f01', '00000000-0000-4000-8000-0000000003a1',
   '00000000-0000-4000-8000-000000003e01', 1),
  ('00000000-0000-4000-8000-000000003f02', '00000000-0000-4000-8000-0000000003b2',
   '00000000-0000-4000-8000-000000003e02', 1),
  ('00000000-0000-4000-8000-000000003f03', '00000000-0000-4000-8000-0000000003c3',
   '00000000-0000-4000-8000-000000003e03', 1);

insert into public.progress_comments (progress_log_id, author_id, body) values
  -- C on B's log (goes with the log), B on C's log (goes with B),
  -- A on C's log (stays).
  ('00000000-0000-4000-8000-000000003f02', '00000000-0000-4000-8000-0000000003c3', 'C on B'),
  ('00000000-0000-4000-8000-000000003f03', '00000000-0000-4000-8000-0000000003b2', 'B on C'),
  ('00000000-0000-4000-8000-000000003f03', '00000000-0000-4000-8000-0000000003a1', 'A on C');

insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind) values
  ('00000000-0000-4000-8000-000000003d03', '00000000-0000-4000-8000-00000000c301',
   '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003d4', 'invite'),
  ('00000000-0000-4000-8000-000000003d03', '00000000-0000-4000-8000-00000000c301',
   '00000000-0000-4000-8000-0000000003e5', '00000000-0000-4000-8000-0000000003e5', 'request');

-- Supabase Auth's login state, with no FK to auth.users (0017): one row for
-- B, who deletes their account below, and one for A, who doesn't.
insert into auth.flow_state (id, user_id, provider_type, authentication_method) values
  ('00000000-0000-4000-8000-000000003a01', '00000000-0000-4000-8000-0000000003b2', 'email', 'otp'),
  ('00000000-0000-4000-8000-000000003a02', '00000000-0000-4000-8000-0000000003a1', 'email', 'otp');

insert into public.nudges (from_user_id, to_user_id, pairing_id, type) values
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003c3',
   '00000000-0000-4000-8000-000000003d03', 'reaction'),
  ('00000000-0000-4000-8000-0000000003c3', '00000000-0000-4000-8000-0000000003b2',
   '00000000-0000-4000-8000-000000003d03', 'reaction');


-- =============================================================================
-- As O (organizer of K3, which has a student): refused, nothing deleted
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000003f6","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: an organizer with students deleted their account';
  exception when sqlstate 'SP004' then null;
  end;
end $$;

reset role;

do $$
begin
  if not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000003f6')
     or not exists (select 1 from public.classes where id = '00000000-0000-4000-8000-00000000c303') then
    raise exception 'FAIL: a refused delete_my_account still deleted something';
  end if;
end $$;


-- =============================================================================
-- As O2 (organizer of K4, no students): the account and K4 go
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000307","role":"authenticated"}', true);
set local role authenticated;

select public.delete_my_account();

reset role;

do $$
begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000307') then
    raise exception 'FAIL: O2''s account was not deleted';
  end if;
  if exists (select 1 from public.classes where id = '00000000-0000-4000-8000-00000000c304') then
    raise exception 'FAIL: O2''s class without students was left behind';
  end if;
end $$;


-- =============================================================================
-- As B: deletes their account; only B's rows go
-- =============================================================================

create temp table before_others on commit drop as
select
  (select count(*) from auth.users where email like 'rls-test-leave-%' and email <> 'rls-test-leave-b@andrew.ac.jp') as users,
  (select count(*) from public.targets where user_id <> '00000000-0000-4000-8000-0000000003b2'
     and user_id::text like '00000000-0000-4000-8000-0000000003%') as targets,
  (select count(*) from public.progress_logs where user_id <> '00000000-0000-4000-8000-0000000003b2'
     and user_id::text like '00000000-0000-4000-8000-0000000003%') as logs,
  (select count(*) from public.class_memberships where user_id <> '00000000-0000-4000-8000-0000000003b2'
     and user_id::text like '00000000-0000-4000-8000-0000000003%') as memberships;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000003b2","role":"authenticated"}', true);
set local role authenticated;

select public.delete_my_account();

reset role;

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-0000000003b2';
  c constant uuid := '00000000-0000-4000-8000-0000000003c3';
  e constant uuid := '00000000-0000-4000-8000-0000000003e5';
  p3 constant uuid := '00000000-0000-4000-8000-000000003d03';
  p4 constant uuid := '00000000-0000-4000-8000-000000003d04';
  left_over int;
begin
  -- Nothing of B's is left anywhere.
  select (select count(*) from auth.users where id = b)
       + (select count(*) from auth.identities where user_id = b)
       + (select count(*) from auth.sessions where user_id = b)
       + (select count(*) from auth.flow_state where user_id = b)
       + (select count(*) from public.profiles where id = b)
       + (select count(*) from public.class_memberships where user_id = b)
       + (select count(*) from public.pairing_members where user_id = b)
       + (select count(*) from public.targets where user_id = b)
       + (select count(*) from public.progress_logs where user_id = b)
       + (select count(*) from public.progress_comments where author_id = b)
       + (select count(*) from public.nudges where from_user_id = b or to_user_id = b)
       + (select count(*) from public.pod_invitations where inviter_id = b or invitee_id = b)
    into left_over;
  if left_over <> 0 then
    raise exception 'FAIL: % row(s) of B survived delete_my_account', left_over;
  end if;

  -- Comments on B's log went with it.
  if exists (select 1 from public.progress_comments
             where progress_log_id = '00000000-0000-4000-8000-000000003f02') then
    raise exception 'FAIL: a comment on B''s log survived';
  end if;

  -- Everyone else is intact.
  if (select count(*) from auth.users where email like 'rls-test-leave-%') <> (select users from before_others) then
    raise exception 'FAIL: delete_my_account deleted another user';
  end if;
  if (select count(*) from public.targets where user_id::text like '00000000-0000-4000-8000-0000000003%')
       <> (select targets from before_others)
     or (select count(*) from public.progress_logs where user_id::text like '00000000-0000-4000-8000-0000000003%')
       <> (select logs from before_others)
     or (select count(*) from public.class_memberships where user_id::text like '00000000-0000-4000-8000-0000000003%')
       <> (select memberships from before_others) then
    raise exception 'FAIL: other users'' targets, logs or memberships changed';
  end if;
  if not exists (select 1 from public.progress_comments
                 where author_id = '00000000-0000-4000-8000-0000000003a1') then
    raise exception 'FAIL: A''s comment on C''s log was deleted';
  end if;
  if exists (select 1 from auth.flow_state where id = '00000000-0000-4000-8000-000000003a01') then
    raise exception 'FAIL: B''s auth.flow_state row survived (0017)';
  end if;
  if not exists (select 1 from auth.flow_state where id = '00000000-0000-4000-8000-000000003a02') then
    raise exception 'FAIL: delete_my_account deleted another user''s auth.flow_state row';
  end if;

  -- P3 keeps C and E's request; P4 (B alone) is gone.
  if not exists (select 1 from public.pairing_members where pairing_id = p3 and user_id = c) then
    raise exception 'FAIL: C lost their pod';
  end if;
  if not exists (select 1 from public.pod_invitations
                 where pod_id = p3 and invitee_id = e and status = 'pending') then
    raise exception 'FAIL: E''s request to P3 was deleted';
  end if;
  if exists (select 1 from public.pairings where id = p4) then
    raise exception 'FAIL: the pod B was alone in was left behind';
  end if;
end $$;


-- =============================================================================
-- Grants: authenticated may call both, anon neither
-- =============================================================================

do $$
begin
  if has_function_privilege('anon', 'public.leave_pod(uuid)', 'execute')
     or has_function_privilege('anon', 'public.delete_my_account()', 'execute') then
    raise exception 'FAIL: anon can execute a 0016 function';
  end if;
  if not has_function_privilege('authenticated', 'public.leave_pod(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.delete_my_account()', 'execute') then
    raise exception 'FAIL: authenticated can''t execute a 0016 function';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
