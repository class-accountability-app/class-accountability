-- =============================================================================
-- rls_class_link_pods.sql — RLS and constraint tests for 0012
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class
-- and pods, impersonates each user the way PostgREST does (role + JWT claims),
-- and checks what the database allows. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B  — in class K, same pod (P1)
--   C     — in class K, no pod
--   E     — in class K, a different pod (P2)
--   D     — signed up, not in class K
--
-- Not covered here: two concurrent inserts for the same student. One SQL
-- script is one session, so it can't race itself; the advisory lock in
-- enforce_one_pod_per_class() is what covers that (see the comment in 0012).
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'rls-test-a@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'rls-test-b@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'rls-test-c@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'rls-test-d@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e5', 'rls-test-e@andrew.ac.jp', 'authenticated', 'authenticated');

-- The owner asks for a code too: the insert trigger must replace it.
insert into public.classes (id, name, university, term, created_by, join_code) values
  ('00000000-0000-4000-8000-00000000c1a5', 'RLS test class', 'Test', 'test',
   '00000000-0000-4000-8000-0000000000a1', 'AAAAAAAA');

insert into public.class_memberships (user_id, class_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-00000000c1a5');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e5');

do $$
declare
  code text := (select join_code from public.classes
                where id = '00000000-0000-4000-8000-00000000c1a5');
begin
  if code = 'AAAAAAAA' or code !~ '^[A-HJKMNP-Z2-9]{8}$' then
    raise exception 'FAIL: the insert trigger did not pick a join code (got %)', code;
  end if;
  if exists (select 1 from public.classes where join_code is null) then
    raise exception 'FAIL: a class has no join code';
  end if;

  -- The one-pod rule holds for the owner too (it's a trigger, not RLS).
  begin
    insert into public.pairing_members (pairing_id, user_id) values
      ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: A was added to a second pod in the same class';
  exception when sqlstate 'SP002' then null;
  end;
end $$;

-- For the UPDATE test below: an UPDATE policy on classes, as a later
-- migration might add. It exists only inside this transaction.
create policy "rls test: update classes" on public.classes
  for update to authenticated using (true) with check (true);


-- =============================================================================
-- As C (in the class, no pod)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000000c1a5';
  p1 constant uuid := '00000000-0000-4000-8000-0000000000f1';
  code text := (select join_code from public.classes where id = k);
  r record;
  n integer;
  new_pod uuid;
  other_class uuid;
begin
  -- --- join code lookup -------------------------------------------------------

  select * into r from public.class_by_join_code(code);
  if r.id is distinct from k or r.member_count <> 4 or not r.is_member then
    raise exception 'FAIL: lookup by code for a member returned %', r;
  end if;

  -- Lower case, a hyphen and spaces still match.
  select * into r from public.class_by_join_code(
    ' ' || lower(substr(code, 1, 4)) || '-' || lower(substr(code, 5)) || ' ');
  if r.id is distinct from k then
    raise exception 'FAIL: lookup ignored case/hyphen normalisation';
  end if;

  if exists (select 1 from public.class_by_join_code('ZZZZZZZZ') where id = k)
     or (select count(*) from public.class_by_join_code('not-a-code')) <> 0 then
    raise exception 'FAIL: an invalid code found a class';
  end if;

  -- --- join_code can't be chosen or changed by a client ------------------------

  insert into public.classes (name, university, term, created_by, join_code)
  values ('RLS test class 2', 'Test', 'test', '00000000-0000-4000-8000-0000000000c3', 'BBBBBBBB')
  returning id into other_class;
  if (select join_code from public.classes where id = other_class) = 'BBBBBBBB' then
    raise exception 'FAIL: a client chose its own join code';
  end if;

  begin
    update public.classes set join_code = 'CCCCCCCC' where id = k;
    raise exception 'FAIL: a client changed join_code';
  exception when insufficient_privilege then null;
  end;
  if (select join_code from public.classes where id = k) <> code then
    raise exception 'FAIL: join_code changed';
  end if;

  -- Other columns still update normally under that (test-only) policy.
  update public.classes set term = 'test 2' where id = k;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: the join_code guard blocked an unrelated update'; end if;

  -- --- no direct way into pods ---------------------------------------------------

  begin
    insert into public.pairing_members (pairing_id, user_id)
    values (p1, '00000000-0000-4000-8000-0000000000c3');
    raise exception 'FAIL: C inserted themselves into a pod directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.pairings (class_id) values (k);
    raise exception 'FAIL: C created a pod row directly';
  exception when insufficient_privilege then null;
  end;

  -- --- create_pod ------------------------------------------------------------------

  new_pod := public.create_pod(k);
  if (select count(*) from public.pairing_members where pairing_id = new_pod) <> 1 then
    raise exception 'FAIL: create_pod did not add C to the new pod';
  end if;

  begin
    perform public.create_pod(k);
    raise exception 'FAIL: C created a second pod in the same class';
  exception when sqlstate 'SP002' then null;
  end;

  -- The refused call left no empty pod behind: K has P1, P2 and C's pod.
  if (select count(*) from public.pairings where class_id = k) <> 3 then
    raise exception 'FAIL: a refused create_pod left a pod behind';
  end if;
end $$;

reset role;


-- =============================================================================
-- As A (pod P1): invite E, who is already in P2
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5',
   '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e5', 'invite');

reset role;


-- =============================================================================
-- As E (pod P2): accepting the invite to P1 is refused; decline it, twice
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  inv uuid := (select id from public.pod_invitations
               where invitee_id = '00000000-0000-4000-8000-0000000000e5' and status = 'pending');
begin
  begin
    perform public.accept_pod_invitation(inv);
    raise exception 'FAIL: E accepted an invite into a second pod';
  exception when sqlstate 'SP002' then null;
  end;

  if exists (select 1 from public.pairing_members
             where pairing_id = '00000000-0000-4000-8000-0000000000f1'
               and user_id = '00000000-0000-4000-8000-0000000000e5') then
    raise exception 'FAIL: E ended up in P1';
  end if;
  if (select status from public.pod_invitations where id = inv) <> 'pending' then
    raise exception 'FAIL: a refused accept still changed the invitation';
  end if;

  update public.pod_invitations set status = 'declined' where id = inv;

  -- E asks to join P1 (allowed to ask; approving it must fail below).
  insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5',
     '00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e5', 'request');
end $$;

reset role;


-- =============================================================================
-- As A: approving E's request is refused; invite E again; one pending only
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  req uuid := (select id from public.pod_invitations
               where kind = 'request' and invitee_id = '00000000-0000-4000-8000-0000000000e5');
begin
  begin
    perform public.accept_pod_invitation(req);
    raise exception 'FAIL: A approved a request from someone already in another pod';
  exception when sqlstate 'SP002' then null;
  end;
  update public.pod_invitations set status = 'declined' where id = req;

  -- A second invite after a decline is fine...
  insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5',
     '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e5', 'invite');

  -- ...but not two pending ones.
  begin
    insert into public.pod_invitations (pod_id, class_id, inviter_id, invitee_id, kind) values
      ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e5', 'invite');
    raise exception 'FAIL: two pending invitations for the same person and pod';
  exception when unique_violation then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As E: declining the same pod a second time works (it failed before 0012)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  update public.pod_invitations set status = 'declined'
  where invitee_id = '00000000-0000-4000-8000-0000000000e5'
    and kind = 'invite' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: E could not decline a second invite to the same pod'; end if;
end $$;

reset role;


-- =============================================================================
-- As D (not in the class)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000000c1a5';
  r record;
begin
  -- Screen 04 works before joining: the class and a count, not membership.
  select * into r from public.class_by_join_code(
    (select join_code from public.classes where id = k));
  if r.id is distinct from k or r.is_member or r.member_count <> 4 then
    raise exception 'FAIL: lookup for a non-member returned %', r;
  end if;

  -- Still can't see who is in it.
  if exists (select 1 from public.class_memberships where class_id = k) then
    raise exception 'FAIL: D can read the class''s memberships';
  end if;

  begin
    perform public.create_pod(k);
    raise exception 'FAIL: D created a pod in a class they are not in';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- Logged out (anon)
-- =============================================================================

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
begin
  begin
    perform public.class_by_join_code('AAAAAAAA');
    raise exception 'FAIL: anon can look up a class by code';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_pod('00000000-0000-4000-8000-00000000c1a5');
    raise exception 'FAIL: anon can call create_pod';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

select 'all RLS tests passed' as result;

rollback;
