-- =============================================================================
-- rls_research_metrics.sql — tests for 0020 (research metrics)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK. Nothing it writes survives, and it
-- prints nothing about anyone: failures name test-cast numbers only.
--
-- So that only the test cast is counted, every account that isn't an
-- rls-test-* account is put in private.research_excluded_users first (inside
-- this transaction, rolled back with the rest; their ids are never output).
--
-- Cast (all @andrew.ac.jp; weeks are Tokyo weeks, W0 = the Monday three weeks
-- before this week, so W3 is the current, incomplete week):
--   A1..A10  students in class K, joined in W0. All log in W0 (log counts
--            1,1,1,2,2,2,3,3,3,3; A1..A6 write in Study Pods); A1..A5 log in
--            W1; A1, A2 log in W2. Pods P1 {A1,A2,A3} and P2 {A4,A5} in W0.
--            A ring of 10 nudges on Monday evening of W0: A1..A5 log within
--            48 h, A6..A10 later. A1 has a push subscription. A1..A6 create
--            document targets in W0.
--   X_opt    student in K, excluded with reason 'opt_out'
--   X_test   student in K, excluded with reason 'test'
--   X_org    student in K and organizer of class K2 (excluded as organizer)
--   OG       organizer of K
--   The three X accounts joined a week earlier, log in W0, form pod P3, nudge
--   and are nudged, subscribe or create a document target: if any of them
--   were counted, the first week, W0's active count, the nudges and the pods
--   would all change.
--
-- Checks: the exact output of research_weekly() and research_retention();
-- each exclusion rule, switched off once, changes the output (so it is that
-- rule doing the work); the reason CHECK; anon and authenticated can't read
-- or change the table or call any of the four functions; public.profiles is
-- unchanged.
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

create function pg_temp.rt_uid(i integer) returns uuid
language sql immutable
as $$ select ('00000000-0000-4000-8000-0000000020' || lpad(i::text, 2, '0'))::uuid $$;

create function pg_temp.rt_w0() returns timestamp
language sql stable
as $$ select date_trunc('week', now() at time zone 'Asia/Tokyo') - interval '21 days' $$;

-- Tokyo wall-clock time W0 + offset, as a timestamptz.
create function pg_temp.rt_at(offset_ interval) returns timestamptz
language sql stable
as $$ select (pg_temp.rt_w0() + offset_) at time zone 'Asia/Tokyo' $$;

do $$
declare
  k  uuid := '00000000-0000-4000-8000-0000000020c1';
  k2 uuid := '00000000-0000-4000-8000-0000000020c2';
  p1 uuid := '00000000-0000-4000-8000-0000000020d1';
  p2 uuid := '00000000-0000-4000-8000-0000000020d2';
  p3 uuid := '00000000-0000-4000-8000-0000000020d3';
  i integer;
begin
  for i in 1..14 loop
    insert into auth.users (id, email, aud, role)
    values (pg_temp.rt_uid(i), format('rls-test-research-%s@andrew.ac.jp', i), 'authenticated', 'authenticated');
  end loop;

  -- Only the test cast counts from here on.
  insert into private.research_excluded_users (user_id, reason)
  select id, 'other' from auth.users where email not like 'rls-test-%'
  on conflict (user_id) do nothing;

  insert into public.classes (id, name, university, term) values
    (k, 'RLS test class research', 'Test', 'test'),
    (k2, 'RLS test class research 2', 'Test', 'test');

  for i in 1..10 loop
    insert into public.class_memberships (user_id, class_id, role, joined_at)
    values (pg_temp.rt_uid(i), k, 'student', pg_temp.rt_at('12 hours'));
  end loop;
  for i in 11..13 loop
    insert into public.class_memberships (user_id, class_id, role, joined_at)
    values (pg_temp.rt_uid(i), k, 'student', pg_temp.rt_at('-7 days 12 hours'));
  end loop;
  insert into public.class_memberships (user_id, class_id, role, joined_at) values
    (pg_temp.rt_uid(13), k2, 'organizer', pg_temp.rt_at('-7 days 12 hours')),
    (pg_temp.rt_uid(14), k, 'organizer', pg_temp.rt_at('-7 days 12 hours'));

  insert into private.research_excluded_users (user_id, reason) values
    (pg_temp.rt_uid(11), 'opt_out'),
    (pg_temp.rt_uid(12), 'test');

  insert into public.pairings (id, class_id, created_at) values
    (p1, k, pg_temp.rt_at('1 day 9 hours')),
    (p2, k, pg_temp.rt_at('1 day 9 hours')),
    (p3, k, pg_temp.rt_at('1 day 9 hours'));
  insert into public.pairing_members (pairing_id, user_id, joined_at) values
    (p1, pg_temp.rt_uid(1), pg_temp.rt_at('1 day 9 hours')),
    (p1, pg_temp.rt_uid(2), pg_temp.rt_at('1 day 9 hours')),
    (p1, pg_temp.rt_uid(3), pg_temp.rt_at('1 day 9 hours')),
    (p2, pg_temp.rt_uid(4), pg_temp.rt_at('1 day 9 hours')),
    (p2, pg_temp.rt_uid(5), pg_temp.rt_at('1 day 9 hours')),
    (p3, pg_temp.rt_uid(11), pg_temp.rt_at('1 day 9 hours')),
    (p3, pg_temp.rt_uid(12), pg_temp.rt_at('1 day 9 hours')),
    (p3, pg_temp.rt_uid(13), pg_temp.rt_at('1 day 9 hours'));

  -- A manual target each (ids …21nn), and document targets (…22nn) for
  -- A1..A6 and X_opt, created on Wednesday of W0.
  for i in 1..13 loop
    insert into public.targets (id, user_id, class_id, title, target_type, created_at)
    values (('00000000-0000-4000-8000-0000000021' || lpad(i::text, 2, '0'))::uuid,
            pg_temp.rt_uid(i), k, 'rt', 'study_hours', pg_temp.rt_at('0 hours'));
  end loop;
  foreach i in array array[1, 2, 3, 4, 5, 6, 11] loop
    insert into public.targets (id, user_id, class_id, title, target_type, target_amount, input_mode, created_at)
    values (('00000000-0000-4000-8000-0000000022' || lpad(i::text, 2, '0'))::uuid,
            pg_temp.rt_uid(i), k, 'rt doc', 'character_count', 1000, 'document', pg_temp.rt_at('2 days'));
  end loop;
end $$;

-- Logs. m(i) = manual target, d(i) = document target; times are W0 + offset.
create temporary table rt_logs (i integer, doc boolean, at_ interval);
insert into rt_logs values
  -- W0, Tuesday 10:00 (within 48 h of the nudges): A1..A3 write once, A4, A5
  -- write and log once
  (1, true, '1 day 10 hours'), (2, true, '1 day 10 hours'), (3, true, '1 day 10 hours'),
  (4, true, '1 day 10 hours'), (4, false, '1 day 10 hours'),
  (5, true, '1 day 10 hours'), (5, false, '1 day 10 hours'),
  -- W0, Thursday 12:00 (after the 48 h): A6 writes and logs, A7..A10 log 3 times
  (6, true, '3 days 12 hours'), (6, false, '3 days 12 hours'),
  (7, false, '3 days 12 hours'), (7, false, '3 days 13 hours'), (7, false, '3 days 14 hours'),
  (8, false, '3 days 12 hours'), (8, false, '3 days 13 hours'), (8, false, '3 days 14 hours'),
  (9, false, '3 days 12 hours'), (9, false, '3 days 13 hours'), (9, false, '3 days 14 hours'),
  (10, false, '3 days 12 hours'), (10, false, '3 days 13 hours'), (10, false, '3 days 14 hours'),
  -- W1: A1..A5 once; W2: A1, A2 once
  (1, false, '9 days 10 hours'), (2, false, '9 days 10 hours'), (3, false, '9 days 10 hours'),
  (4, false, '9 days 10 hours'), (5, false, '9 days 10 hours'),
  (1, false, '16 days 10 hours'), (2, false, '16 days 10 hours'),
  -- The excluded: in W0 and the week before
  (11, true, '1 day 10 hours'), (11, false, '-6 days'), (12, false, '1 day 10 hours'),
  (12, false, '-6 days'), (13, false, '1 day 10 hours'), (13, false, '-6 days');

insert into public.progress_logs (user_id, target_id, source, progress_value, logged_at)
select pg_temp.rt_uid(l.i),
       (case when l.doc then '00000000-0000-4000-8000-0000000022' else '00000000-0000-4000-8000-0000000021' end
         || lpad(l.i::text, 2, '0'))::uuid,
       case when l.doc then 'document' else 'manual' end,
       100,
       pg_temp.rt_at(l.at_)
from rt_logs l;

-- Nudges: a ring A1→A2→…→A10→A1, plus X_opt→A1 and A2→X_test. The insert
-- trigger stamps now(), so the owner moves them to Monday 20:00 of W0.
insert into public.nudges (from_user_id, to_user_id, pairing_id, type)
select pg_temp.rt_uid(i), pg_temp.rt_uid(i % 10 + 1), '00000000-0000-4000-8000-0000000020d1', 'reaction'
from generate_series(1, 10) as i;
insert into public.nudges (from_user_id, to_user_id, pairing_id, type) values
  (pg_temp.rt_uid(11), pg_temp.rt_uid(1), '00000000-0000-4000-8000-0000000020d1', 'reaction'),
  (pg_temp.rt_uid(2), pg_temp.rt_uid(12), '00000000-0000-4000-8000-0000000020d1', 'reaction');
update public.nudges set created_at = pg_temp.rt_at('20 hours')
where from_user_id in (select pg_temp.rt_uid(i) from generate_series(1, 14) as i);

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale, created_at) values
  (pg_temp.rt_uid(1), 'https://fcm.googleapis.com/fcm/send/rls-test-research-1', repeat('B', 87), repeat('a', 22), 'ja', pg_temp.rt_at('1 day')),
  (pg_temp.rt_uid(12), 'https://fcm.googleapis.com/fcm/send/rls-test-research-12', repeat('B', 87), repeat('a', 22), 'ja', pg_temp.rt_at('1 day'));


-- --- 1. The figures ----------------------------------------------------------

do $$
declare
  w0 date := pg_temp.rt_w0()::date;
  diff text;
begin
  -- W0: 10 active, median 2.0, 5 of 10 in a pod (50%), 2 pods (5 people),
  --     10 nudges, 5 of 10 followed within 48 h by 5 + 5 recipients (50%),
  --     1 with push (<5), 6 document targets, 6 of 10 writing (rest 4: <5).
  -- W1: 5 active, median 1.0, pod share unchanged, nothing else (<5).
  -- W2: 2 active (<5). W3: the current week, not complete.
  with expected (week_start, week_complete, active_students, logs_per_active_student_median,
                 pct_students_with_pod, pods_formed, nudges_sent, pct_nudges_followed_by_log_48h,
                 pct_students_push_opt_in, document_targets_created, pct_active_students_writing) as (
    values
      (w0,      true,  '10', '2.0', '50%', '2',  '10', '50%', '<5', '6',  '<5'),
      (w0 + 7,  true,  '5',  '1.0', '50%', '<5', '<5', '<5',  '<5', '<5', '<5'),
      (w0 + 14, true,  '<5', '<5',  '50%', '<5', '<5', '<5',  '<5', '<5', '<5'),
      (w0 + 21, false, '<5', '<5',  '50%', '<5', '<5', '<5',  '<5', '<5', '<5')
  ),
  got as (select * from private.research_weekly())
  select string_agg(d::text, ' | ') into diff
  from ((select 'got', * from got except select 'got', * from expected)
        union all
        (select 'expected', * from expected except select 'expected', * from got)) as d;
  if diff is not null then
    raise exception 'FAIL: research_weekly() differs: %', diff;
  end if;

  -- Retention: the 10 who logged in W0; 5 in W1 (50%), 2 in W2 (<5); W3 isn't
  -- over, so N = 3..12 have no one yet (<5).
  with expected (weeks_after_first, pct_still_active) as (
    select n, case when n = 1 then '50%' else '<5' end from generate_series(1, 12) as n
  ),
  got as (select * from private.research_retention())
  select string_agg(d::text, ' | ') into diff
  from ((select 'got', * from got except select 'got', * from expected)
        union all
        (select 'expected', * from expected except select 'expected', * from got)) as d;
  if diff is not null then
    raise exception 'FAIL: research_retention() differs: %', diff;
  end if;
end $$;


-- --- 2. Each exclusion is what keeps them out --------------------------------
-- Switched off one at a time inside a block that undoes itself (RT001).

do $$
declare
  w0 date := pg_temp.rt_w0()::date;
  got text;
  first_week date;
begin
  begin
    delete from private.research_excluded_users where user_id = pg_temp.rt_uid(11);
    select active_students into got from private.research_weekly() where week_start = w0;
    select min(week_start) into first_week from private.research_weekly();
    if got <> '11' or first_week <> w0 - 7 then
      raise exception 'FAIL: without the opt_out row, W0 should count 11 active from W0-7 (got %, %)', got, first_week;
    end if;
    raise exception 'undo' using errcode = 'RT001';
  exception when sqlstate 'RT001' then null;
  end;

  begin
    delete from private.research_excluded_users where user_id = pg_temp.rt_uid(12);
    select active_students into got from private.research_weekly() where week_start = w0;
    if got <> '11' then
      raise exception 'FAIL: without the test row, W0 should count 11 active (got %)', got;
    end if;
    raise exception 'undo' using errcode = 'RT001';
  exception when sqlstate 'RT001' then null;
  end;

  -- X_org is a student in K: only the organizer role in K2 keeps them out.
  begin
    delete from public.class_memberships
    where user_id = pg_temp.rt_uid(13) and class_id = '00000000-0000-4000-8000-0000000020c2';
    select active_students into got from private.research_weekly() where week_start = w0;
    if got <> '11' then
      raise exception 'FAIL: without the organizer role elsewhere, W0 should count 11 active (got %)', got;
    end if;
    select pct_still_active into got from private.research_retention() where weeks_after_first = 1;
    if got is null then
      raise exception 'FAIL: research_retention() returned no row for N = 1';
    end if;
    raise exception 'undo' using errcode = 'RT001';
  exception when sqlstate 'RT001' then null;
  end;

  -- Back to the full exclusions.
  if (select active_students from private.research_weekly() where week_start = w0) <> '10' then
    raise exception 'FAIL: the undo blocks left something behind';
  end if;

  -- Only the three reasons.
  begin
    insert into private.research_excluded_users (user_id, reason) values (pg_temp.rt_uid(1), 'bogus');
    raise exception 'FAIL: a reason outside test / opt_out / other was accepted';
  exception when check_violation then null;
  end;
end $$;


-- --- 3. Privileges (catalog) -------------------------------------------------

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_schema_privilege(r, 'private', 'usage') then
      raise exception 'FAIL: % has USAGE on schema private', r;
    end if;
    if has_table_privilege(r, 'private.research_excluded_users', 'select, insert, update, delete, truncate, references, trigger') then
      raise exception 'FAIL: % has a privilege on private.research_excluded_users', r;
    end if;
    if has_function_privilege(r, 'private.research_weekly()', 'execute')
       or has_function_privilege(r, 'private.research_retention()', 'execute')
       or has_function_privilege(r, 'private.research_count(bigint, bigint)', 'execute')
       or has_function_privilege(r, 'private.research_pct(bigint, bigint, bigint, bigint, integer)', 'execute') then
      raise exception 'FAIL: % can execute a research function', r;
    end if;
  end loop;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name like 'research%') then
    raise exception 'FAIL: public.profiles has a research column (0020 must not change profiles)';
  end if;
end $$;


-- --- 4. Logged out (anon) ----------------------------------------------------

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
begin
  begin
    perform 1 from private.research_excluded_users;
    raise exception 'FAIL: anon read private.research_excluded_users';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into private.research_excluded_users (user_id, reason)
    values ('00000000-0000-4000-8000-000000002001', 'opt_out');
    raise exception 'FAIL: anon inserted into private.research_excluded_users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_weekly();
    raise exception 'FAIL: anon called research_weekly()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_retention();
    raise exception 'FAIL: anon called research_retention()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_count(10, 10);
    raise exception 'FAIL: anon called research_count()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_pct(5, 10, 5, 5, 1);
    raise exception 'FAIL: anon called research_pct()';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- --- 5. Signed in as student A1 ----------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000002001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  me uuid := '00000000-0000-4000-8000-000000002001';
begin
  -- A student can't see whether they (or anyone) are excluded or opted out,
  -- and can't opt themselves in or out.
  begin
    perform 1 from private.research_excluded_users where user_id = me;
    raise exception 'FAIL: a student read private.research_excluded_users';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into private.research_excluded_users (user_id, reason) values (me, 'opt_out');
    raise exception 'FAIL: a student opted themselves out';
  exception when insufficient_privilege then null;
  end;
  begin
    update private.research_excluded_users set reason = 'other' where user_id = me;
    raise exception 'FAIL: a student updated private.research_excluded_users';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from private.research_excluded_users where user_id = me;
    raise exception 'FAIL: a student deleted from private.research_excluded_users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_weekly();
    raise exception 'FAIL: a student called research_weekly()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_retention();
    raise exception 'FAIL: a student called research_retention()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_count(10, 10);
    raise exception 'FAIL: a student called research_count()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.research_pct(5, 10, 5, 5, 1);
    raise exception 'FAIL: a student called research_pct()';
  exception when insufficient_privilege then null;
  end;

  -- profiles is untouched: the student still reads their own row, all columns.
  if (select count(*) from (select * from public.profiles where id = me) as p) <> 1 then
    raise exception 'FAIL: a student can no longer read their own profile';
  end if;
end $$;

reset role;

select 'all RLS tests passed' as result;

rollback;
