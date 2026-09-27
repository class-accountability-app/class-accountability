-- =============================================================================
-- rls_join_code_only.sql — RLS tests for 0013
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, classes
-- and pods, impersonates each user the way PostgREST does (role + JWT claims),
-- and checks what the database allows. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B  — class K, same pod P1
--   B, E  — class L, same pod P2 (A is NOT in class L)
--   C     — in no class; joins K by code
--   D     — creates a class
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

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000000c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-00000000c1a6', 'RLS test class L', 'Test', 'test',
   '00000000-0000-4000-8000-0000000000b2');

insert into public.class_memberships (user_id, class_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c1a6'),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-00000000c1a6');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000c1a6');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e5');

insert into public.targets (id, user_id, class_id, title, target_type, target_amount) values
  ('00000000-0000-4000-8000-00000000aa01', '00000000-0000-4000-8000-0000000000b2',
   '00000000-0000-4000-8000-00000000c1a5', 'B in K', 'study_hours', 10),
  ('00000000-0000-4000-8000-00000000aa02', '00000000-0000-4000-8000-0000000000b2',
   '00000000-0000-4000-8000-00000000c1a6', 'B in L', 'study_hours', 10),
  ('00000000-0000-4000-8000-00000000aa03', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-00000000c1a5', 'A in K', 'task', null);

insert into public.progress_logs (id, user_id, target_id, progress_value) values
  ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-0000000000b2',
   '00000000-0000-4000-8000-00000000aa01', 1),
  ('00000000-0000-4000-8000-00000000bb02', '00000000-0000-4000-8000-0000000000b2',
   '00000000-0000-4000-8000-00000000aa02', 1);

insert into public.progress_comments (progress_log_id, author_id, body) values
  ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-0000000000a1', 'A on B in K'),
  ('00000000-0000-4000-8000-00000000bb02', '00000000-0000-4000-8000-0000000000e5', 'E on B in L');

-- D creates a class below; since 0015 only approved accounts can.
update public.profiles set can_create_classes = true
where id = '00000000-0000-4000-8000-0000000000d4';

-- K's code, for the roles below (a non-member can't read it from classes).
select set_config('rls_test.k_code',
  (select join_code from public.classes where id = '00000000-0000-4000-8000-00000000c1a5'), true);

do $$
begin
  -- Owner inserts don't add the creator as a member (only a student's own do).
  if (select count(*) from public.class_memberships
      where class_id = '00000000-0000-4000-8000-00000000c1a5') <> 2 then
    raise exception 'FAIL: an owner insert added a creator membership';
  end if;

  -- A target's class can't change, not even for the owner.
  begin
    update public.targets set class_id = '00000000-0000-4000-8000-00000000c1a6'
    where id = '00000000-0000-4000-8000-00000000aa03';
    raise exception 'FAIL: the owner moved a target to another class';
  exception when insufficient_privilege then null;
  end;
end $$;


-- =============================================================================
-- As A (class K, pod P1 with B; not in class L)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  k constant uuid := '00000000-0000-4000-8000-00000000c1a5';
  l constant uuid := '00000000-0000-4000-8000-00000000c1a6';
  n integer;
begin
  -- --- classes: only my own ----------------------------------------------------
  if not exists (select 1 from public.classes where id = k) then
    raise exception 'FAIL: A cannot see their own class K';
  end if;
  if exists (select 1 from public.classes where id = l) then
    raise exception 'FAIL: A can see class L, which they are not in';
  end if;

  -- --- a podmate's work only within the pod's class ---------------------------
  if (select count(*) from public.targets where user_id = b) <> 1
     or not exists (select 1 from public.targets where title = 'B in K') then
    raise exception 'FAIL: A should see only B''s target in K';
  end if;
  if exists (select 1 from public.progress_logs
             where id = '00000000-0000-4000-8000-00000000bb02') then
    raise exception 'FAIL: A can see B''s progress in class L';
  end if;
  if not exists (select 1 from public.progress_logs
                 where id = '00000000-0000-4000-8000-00000000bb01') then
    raise exception 'FAIL: A cannot see B''s progress in K';
  end if;
  if exists (select 1 from public.progress_comments where body = 'E on B in L') then
    raise exception 'FAIL: A can see a comment on B''s progress in class L';
  end if;
  if not exists (select 1 from public.progress_comments where body = 'A on B in K') then
    raise exception 'FAIL: A cannot see comments on B''s progress in K';
  end if;
  begin
    insert into public.progress_comments (progress_log_id, author_id, body)
    values ('00000000-0000-4000-8000-00000000bb02', a, 'sneaky');
    raise exception 'FAIL: A commented on B''s progress in class L';
  exception when insufficient_privilege then null;
  end;

  -- B's pod membership in class L is hidden; the pod in K is fully visible.
  if (select count(*) from public.pairing_members where user_id = b) <> 1 then
    raise exception 'FAIL: A can see B''s pod membership in class L';
  end if;
  if (select count(*) from public.pairing_members
      where pairing_id = '00000000-0000-4000-8000-0000000000f1') <> 2 then
    raise exception 'FAIL: A should see both members of their own pod';
  end if;

  -- --- no way into a class except the code -------------------------------------
  begin
    insert into public.class_memberships (user_id, class_id) values (a, l);
    raise exception 'FAIL: A inserted a membership directly';
  exception when insufficient_privilege then null;
  end;

  -- No UPDATE policy: moving my own membership to class L changes nothing.
  update public.class_memberships set class_id = l where user_id = a and class_id = k;
  get diagnostics n = row_count;
  if n <> 0 or exists (select 1 from public.class_memberships where user_id = a and class_id = l)
     or not public.is_class_member(k) then
    raise exception 'FAIL: A moved their membership to class L';
  end if;

  -- --- targets only in my classes, and they stay there ---------------------------
  begin
    insert into public.targets (user_id, class_id, title, target_type)
    values (a, l, 'in a class I am not in', 'task');
    raise exception 'FAIL: A created a target in class L';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.targets set class_id = l where id = '00000000-0000-4000-8000-00000000aa03';
    raise exception 'FAIL: A moved a target to class L';
  exception when insufficient_privilege then null;
  end;

  insert into public.targets (user_id, class_id, title, target_type)
  values (a, k, 'a second target in K', 'task');

  update public.targets set title = 'A in K, renamed'
  where id = '00000000-0000-4000-8000-00000000aa03';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not edit their own target''s title'; end if;
end $$;

reset role;


-- =============================================================================
-- As C (in no class): join K with the code
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  c constant uuid := '00000000-0000-4000-8000-0000000000c3';
  k constant uuid := '00000000-0000-4000-8000-00000000c1a5';
  code constant text := current_setting('rls_test.k_code');
  r record;
begin
  if exists (select 1 from public.classes where id = k) then
    raise exception 'FAIL: C can see class K before joining';
  end if;

  -- Screen 04 still works for a non-member.
  select * into r from public.class_by_join_code(code);
  if r.id is distinct from k or r.is_member then
    raise exception 'FAIL: class_by_join_code for a non-member returned %', r;
  end if;

  -- A wrong code joins nothing.
  if public.join_class_by_code('ZZZZ9999') is not null then
    raise exception 'FAIL: a wrong code returned a class';
  end if;
  if exists (select 1 from public.class_memberships where user_id = c) then
    raise exception 'FAIL: a wrong code created a membership';
  end if;

  -- The right code (lower case, with a hyphen) joins.
  if public.join_class_by_code(lower(substr(code, 1, 4)) || '-' || lower(substr(code, 5))) is distinct from k then
    raise exception 'FAIL: the right code did not return class K';
  end if;
  if not exists (select 1 from public.classes where id = k) then
    raise exception 'FAIL: C cannot see class K after joining';
  end if;

  -- Joining twice is fine and leaves one membership.
  if public.join_class_by_code(code) is distinct from k then
    raise exception 'FAIL: joining twice failed';
  end if;
  if (select count(*) from public.class_memberships where user_id = c and class_id = k) <> 1 then
    raise exception 'FAIL: joining twice made a second membership';
  end if;

  -- A classmate, not a podmate: still no one's targets.
  if exists (select 1 from public.targets where user_id <> c) then
    raise exception 'FAIL: C can see targets of people who are not their podmates';
  end if;
end $$;

reset role;


-- =============================================================================
-- As D: creating a class makes you its first member
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  d constant uuid := '00000000-0000-4000-8000-0000000000d4';
  new_class uuid;
begin
  insert into public.classes (name, university, term, created_by)
  values ('RLS test class M', 'Test', 'test', d)
  returning id into new_class;

  if not exists (select 1 from public.class_memberships
                 where class_id = new_class and user_id = d and role = 'organizer') then
    raise exception 'FAIL: the creator did not become the organizer';
  end if;
  if (select count(*) from public.classes where name like 'RLS test class %') <> 1 then
    raise exception 'FAIL: D should see only the class they created';
  end if;
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
    perform public.join_class_by_code(current_setting('rls_test.k_code'));
    raise exception 'FAIL: anon can join a class by code';
  exception when insufficient_privilege then null;
  end;

  if exists (select 1 from public.classes) then
    raise exception 'FAIL: anon can see classes';
  end if;
end $$;

reset role;

select 'all RLS tests passed' as result;

rollback;
