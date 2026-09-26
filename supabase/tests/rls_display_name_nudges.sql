-- =============================================================================
-- rls_display_name_nudges.sql — RLS tests for 0011
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class
-- and pods, impersonates each user the way PostgREST does (role + JWT claims),
-- and checks what the database allows. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B  — same class, same pod (P1)
--   C     — same class, a different pod (P2)
--   D     — signed up, not in the class
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'rls-test-a@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'rls-test-b@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'rls-test-c@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'rls-test-d@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000000c1a5', 'RLS test class', 'Test', 'test',
   '00000000-0000-4000-8000-0000000000a1');

insert into public.class_memberships (user_id, class_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000c1a5');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c1a5'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c3');

do $$
begin
  if (select count(*) from public.profiles
      where id::text like '00000000-0000-4000-8000-0000000000%'
        and name_chosen_at is null
        and display_name like 'rls-test-_') <> 4 then
    raise exception 'FAIL: signup trigger should create 4 profiles named after the local part, not chosen';
  end if;
end $$;


-- =============================================================================
-- As A (authenticated)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  c constant uuid := '00000000-0000-4000-8000-0000000000c3';
  d constant uuid := '00000000-0000-4000-8000-0000000000d4';
  p1 constant uuid := '00000000-0000-4000-8000-0000000000f1';
  p2 constant uuid := '00000000-0000-4000-8000-0000000000f2';
  n integer;
begin
  -- --- display_name updates ----------------------------------------------------

  -- A can update their own display_name.
  update public.profiles set display_name = 'あき' where id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not update their own display_name'; end if;
  if (select display_name from public.profiles where id = a) <> 'あき' then
    raise exception 'FAIL: A''s new display_name was not stored';
  end if;
  if (select name_chosen_at from public.profiles where id = a) is null then
    raise exception 'FAIL: saving a name did not set name_chosen_at';
  end if;

  -- Someone else's row: RLS filters it out, so zero rows change.
  update public.profiles set display_name = 'hacked' where id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A updated B''s display_name'; end if;

  -- Columns other than display_name: no privilege.
  begin
    update public.profiles set name_chosen_at = now() where id = a;
    raise exception 'FAIL: A could set name_chosen_at directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set university = 'x' where id = a;
    raise exception 'FAIL: A could update university';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.profiles (id, display_name) values (gen_random_uuid(), 'x');
    raise exception 'FAIL: a client could insert a profile';
  exception when insufficient_privilege then null;
  end;

  -- Name rules.
  begin
    update public.profiles set display_name = '' where id = a;
    raise exception 'FAIL: empty name accepted';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set display_name = ' あき' where id = a;
    raise exception 'FAIL: leading space accepted';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set display_name = 'あき　' where id = a;  -- U+3000
    raise exception 'FAIL: trailing full-width space accepted';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set display_name = e'あ\nき' where id = a;
    raise exception 'FAIL: control character accepted';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set display_name = repeat('あ', 81) where id = a;
    raise exception 'FAIL: 81 code points accepted';
  exception when check_violation then null;
  end;

  -- --- profile visibility ------------------------------------------------------

  if (select count(*) from public.profiles where id in (a, b, c)) <> 3 then
    raise exception 'FAIL: A should see their own, podmate B''s and classmate C''s profile';
  end if;
  if exists (select 1 from public.profiles where id = d) then
    raise exception 'FAIL: A can see D, who is not in any of A''s classes';
  end if;

  -- No email anywhere a client can read.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name ilike '%mail%') then
    raise exception 'FAIL: profiles has an email column';
  end if;
  begin
    perform 1 from auth.users limit 1;
    raise exception 'FAIL: authenticated can read auth.users';
  exception when insufficient_privilege then null;
  end;

  -- --- nudge insert policy --------------------------------------------------------

  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values (a, c, p1, 'question_prompt', 'not my podmate');
    raise exception 'FAIL: A nudged C, who is not in A''s pod';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values (a, b, p2, 'question_prompt', 'someone else''s pod');
    raise exception 'FAIL: A nudged B with pairing_id of a pod neither is in';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values (b, a, p1, 'question_prompt', 'pretending to be B');
    raise exception 'FAIL: A sent a nudge as B';
  exception when insufficient_privilege then null;
  end;

  -- --- nudge limit ----------------------------------------------------------------

  -- A normal nudge to a podmate, with their shared pod, succeeds. (The first
  -- is backdated a year by the client; the trigger must store now() instead.)
  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content, created_at)
    values (a, b, p1, 'question_prompt', '1', now() - interval '365 days');
  exception when others then
    raise exception 'FAIL: A''s normal nudge to podmate B was refused (%: %)', sqlstate, sqlerrm;
  end;

  -- The 2nd and 3rd in 24 hours still succeed.
  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values (a, b, p1, 'question_prompt', '2');
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values (a, b, p1, 'question_prompt', '3');
  exception when others then
    raise exception 'FAIL: the 2nd or 3rd nudge in 24 hours was refused (%: %)', sqlstate, sqlerrm;
  end;

  if (select count(*) from public.nudges where from_user_id = a and to_user_id = b) <> 3 then
    raise exception 'FAIL: expected exactly 3 nudges from A to B before the limit';
  end if;

  if exists (select 1 from public.nudges
             where from_user_id = a and created_at < now() - interval '1 minute') then
    raise exception 'FAIL: a client-sent created_at was kept';
  end if;

  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values (a, b, p1, 'question_prompt', '4');
    raise exception 'FAIL: the 4th nudge in 24 hours was accepted';
  exception when sqlstate 'SP001' then null;
  end;

  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content, created_at)
    values (a, b, p1, 'question_prompt', '4, backdated', now() - interval '2 days');
    raise exception 'FAIL: a backdated 4th nudge got past the limit';
  exception when sqlstate 'SP001' then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As B: the limit is per sender→recipient, so B can still nudge A
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
    values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000f1', 'question_prompt', 'back at you');
  exception when others then
    raise exception 'FAIL: B could not nudge A although A is the one at the limit (%: %)', sqlstate, sqlerrm;
  end;

  if (select display_name from public.profiles
      where id = '00000000-0000-4000-8000-0000000000a1') <> 'あき' then
    raise exception 'FAIL: B does not see podmate A''s chosen name';
  end if;
  if (select count(*) from public.nudges) <> 4 then
    raise exception 'FAIL: B should see exactly the 3 nudges received and 1 sent';
  end if;
end $$;

reset role;


-- =============================================================================
-- As C: keeping the auto-filled name still counts as choosing it
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.profiles set display_name = display_name
  where id = '00000000-0000-4000-8000-0000000000c3';

  if (select name_chosen_at from public.profiles
      where id = '00000000-0000-4000-8000-0000000000c3') is null then
    raise exception 'FAIL: keeping the same name did not mark it chosen';
  end if;
  if exists (select 1 from public.nudges) then
    raise exception 'FAIL: C can read nudges between A and B';
  end if;
end $$;

reset role;


-- =============================================================================
-- As D (in no class): sees only their own profile
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FAIL: D should see only their own profile';
  end if;
end $$;

reset role;


-- =============================================================================
-- Logged out (anon): sees no profiles, can't write any
-- =============================================================================

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
begin
  if exists (select 1 from public.profiles) then
    raise exception 'FAIL: anon can read profiles';
  end if;
  begin
    update public.profiles set display_name = 'anon';
    raise exception 'FAIL: anon can update profiles';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

select 'all RLS tests passed' as result;

rollback;
