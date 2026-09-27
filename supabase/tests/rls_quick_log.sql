-- =============================================================================
-- rls_quick_log.sql — RLS tests for 0014 (quick log: edit, delete, client_id)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class,
-- a pod, targets and logs, impersonates each user the way PostgREST does
-- (role + JWT claims), and checks what the database allows. Nothing it writes
-- survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — class K, same pod P
--   C    — class K, not in the pod
--   A owns targets TA1 (characters) and TA2 (task); B owns TB.
--   LA1 is A's log on TA1 (B commented on it); LB1 is B's log on TB.
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000001a1', 'rls-test-qa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000001b2', 'rls-test-qb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000001c3', 'rls-test-qc@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000001c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000001a1');

insert into public.class_memberships (user_id, class_id) values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-00000001c1a5'),
  ('00000000-0000-4000-8000-0000000001b2', '00000000-0000-4000-8000-00000001c1a5'),
  ('00000000-0000-4000-8000-0000000001c3', '00000000-0000-4000-8000-00000001c1a5');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000001f1', '00000000-0000-4000-8000-00000001c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000001f1', '00000000-0000-4000-8000-0000000001a1'),
  ('00000000-0000-4000-8000-0000000001f1', '00000000-0000-4000-8000-0000000001b2');

insert into public.targets (id, user_id, class_id, title, target_type, target_amount) values
  ('00000000-0000-4000-8000-0000000a1a01', '00000000-0000-4000-8000-0000000001a1',
   '00000000-0000-4000-8000-00000001c1a5', 'TA1', 'character_count', 2000),
  ('00000000-0000-4000-8000-0000000a1a02', '00000000-0000-4000-8000-0000000001a1',
   '00000000-0000-4000-8000-00000001c1a5', 'TA2', 'task', null),
  ('00000000-0000-4000-8000-0000000a1b01', '00000000-0000-4000-8000-0000000001b2',
   '00000000-0000-4000-8000-00000001c1a5', 'TB', 'study_hours', 10);

-- An owner insert keeps the time it is given (fixtures can be dated).
insert into public.progress_logs (id, user_id, target_id, progress_value, logged_at) values
  ('00000000-0000-4000-8000-0000000b1a01', '00000000-0000-4000-8000-0000000001a1',
   '00000000-0000-4000-8000-0000000a1a01', 300, '2026-01-02 13:10:00+00'),
  ('00000000-0000-4000-8000-0000000b1b01', '00000000-0000-4000-8000-0000000001b2',
   '00000000-0000-4000-8000-0000000a1b01', 1.5, '2026-01-02 13:10:00+00');

insert into public.progress_comments (id, progress_log_id, author_id, body) values
  ('00000000-0000-4000-8000-0000000c0a01', '00000000-0000-4000-8000-0000000b1a01',
   '00000000-0000-4000-8000-0000000001b2', 'B on LA1');

do $$
begin
  if (select logged_at from public.progress_logs
      where id = '00000000-0000-4000-8000-0000000b1a01') <> '2026-01-02 13:10:00+00' then
    raise exception 'FAIL: an owner insert did not keep its logged_at';
  end if;

  -- Amounts stay positive, for everyone.
  begin
    insert into public.progress_logs (user_id, target_id, progress_value) values
      ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000a1a01', 0);
    raise exception 'FAIL: a log with amount 0 was saved';
  exception when check_violation then null;
  end;

  -- A log's target can't change, not even for the owner.
  begin
    update public.progress_logs set target_id = '00000000-0000-4000-8000-0000000a1a02'
    where id = '00000000-0000-4000-8000-0000000b1a01';
    raise exception 'FAIL: the owner moved a log to another target';
  exception when insufficient_privilege then null;
  end;
end $$;


-- =============================================================================
-- As A (owner of LA1; podmate of B)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a    constant uuid := '00000000-0000-4000-8000-0000000001a1';
  b    constant uuid := '00000000-0000-4000-8000-0000000001b2';
  ta1  constant uuid := '00000000-0000-4000-8000-0000000a1a01';
  ta2  constant uuid := '00000000-0000-4000-8000-0000000a1a02';
  tb   constant uuid := '00000000-0000-4000-8000-0000000a1b01';
  la1  constant uuid := '00000000-0000-4000-8000-0000000b1a01';
  lb1  constant uuid := '00000000-0000-4000-8000-0000000b1b01';
  la2  constant uuid := '00000000-0000-4000-8000-0000000b1a02';
  cid  constant uuid := '00000000-0000-4000-8000-00000000c1d1';
  n integer;
begin
  -- --- my own log: amount and memo can change ---------------------------------
  update public.progress_logs set progress_value = 540, description = 'edited'
  where id = la1;
  get diagnostics n = row_count;
  if n <> 1 or (select progress_value from public.progress_logs where id = la1) <> 540 then
    raise exception 'FAIL: A could not edit their own log';
  end if;

  begin
    update public.progress_logs set progress_value = 0 where id = la1;
    raise exception 'FAIL: A set their log''s amount to 0';
  exception when check_violation then null;
  end;

  -- --- ...but not what it is about, whose it is, or when -----------------------
  begin
    update public.progress_logs set target_id = ta2 where id = la1;
    raise exception 'FAIL: A moved their log to their other target';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.progress_logs set target_id = tb where id = la1;
    raise exception 'FAIL: A moved their log to B''s target';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.progress_logs set logged_at = '2020-01-01 00:00:00+00' where id = la1;
    raise exception 'FAIL: A backdated their log';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.progress_logs set user_id = b where id = la1;
    raise exception 'FAIL: A gave their log to B';
  exception when insufficient_privilege then null;
  end;

  -- --- a new log gets the server's time, even if it asks for another ------------
  insert into public.progress_logs (id, user_id, target_id, progress_value, logged_at, client_id)
  values (la2, a, ta1, 100, '2020-01-01 00:00:00+00', cid);
  if (select logged_at from public.progress_logs where id = la2) <> now() then
    raise exception 'FAIL: A backdated a new log';
  end if;

  -- --- the same client_id twice (a double tap) saves one log --------------------
  begin
    insert into public.progress_logs (user_id, target_id, progress_value, client_id)
    values (a, ta1, 100, cid);
    raise exception 'FAIL: a duplicate client_id created a second log';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.progress_logs where client_id = cid and user_id = a) <> 1 then
    raise exception 'FAIL: expected exactly one log for the client_id';
  end if;

  -- --- B's log: visible to me as a podmate, but not mine to change ---------------
  if not exists (select 1 from public.progress_logs where id = lb1) then
    raise exception 'FAIL: A cannot see podmate B''s log (setup problem)';
  end if;

  update public.progress_logs set progress_value = 99, description = 'sneaky' where id = lb1;
  get diagnostics n = row_count;
  if n <> 0 or (select progress_value from public.progress_logs where id = lb1) <> 1.5 then
    raise exception 'FAIL: A edited B''s log';
  end if;

  delete from public.progress_logs where id = lb1;
  get diagnostics n = row_count;
  if n <> 0 or not exists (select 1 from public.progress_logs where id = lb1) then
    raise exception 'FAIL: A deleted B''s log';
  end if;

  -- --- deleting my commented log takes the comment with it ----------------------
  if not exists (select 1 from public.progress_comments where progress_log_id = la1) then
    raise exception 'FAIL: A cannot see B''s comment on A''s own log (setup problem)';
  end if;
  delete from public.progress_logs where id = la1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not delete their own log'; end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.progress_comments
             where id = '00000000-0000-4000-8000-0000000c0a01') then
    raise exception 'FAIL: a comment outlived its deleted log';
  end if;
end $$;


-- =============================================================================
-- As B: client_id is scoped per person
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  -- A already used this client_id; B using it too is fine.
  insert into public.progress_logs (user_id, target_id, progress_value, client_id)
  values ('00000000-0000-4000-8000-0000000001b2', '00000000-0000-4000-8000-0000000a1b01',
          0.5, '00000000-0000-4000-8000-00000000c1d1');
end $$;

reset role;


-- =============================================================================
-- As C (classmate, not in the pod)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000001c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  la2 constant uuid := '00000000-0000-4000-8000-0000000b1a02';
  n integer;
begin
  if exists (select 1 from public.progress_logs where id = la2) then
    raise exception 'FAIL: C can see A''s log';
  end if;

  update public.progress_logs set progress_value = 99 where id = la2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C edited A''s log'; end if;

  delete from public.progress_logs where id = la2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C deleted A''s log'; end if;
end $$;

reset role;


-- =============================================================================
-- Logged out (anon)
-- =============================================================================

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare
  la2 constant uuid := '00000000-0000-4000-8000-0000000b1a02';
  n integer;
begin
  update public.progress_logs set progress_value = 99 where id = la2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: anon edited a log'; end if;

  delete from public.progress_logs where id = la2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: anon deleted a log'; end if;
end $$;

reset role;

do $$
begin
  if (select progress_value from public.progress_logs
      where id = '00000000-0000-4000-8000-0000000b1a02') <> 100 then
    raise exception 'FAIL: A''s log changed after C and anon tried';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
