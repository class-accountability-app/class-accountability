-- =============================================================================
-- rls_meeting_polls.sql — RLS tests for 0024 (meeting polls, times, answers)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class,
-- pods and projects, impersonates each user the way PostgREST does (role + JWT
-- claims), and checks what the database allows. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — class K, same pod F1, project P
--   C    — class K, alone in pod F2, project Q
--   O    — organizer of K (never in a pod)
--
-- How to run: see "RLS tests" in CLAUDE.md. Before and after, count auth.users,
-- profiles and nudges and confirm they match.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000024a1', 'rls-test-ma@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000024b2', 'rls-test-mb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000024c3', 'rls-test-mc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000024e5', 'rls-test-mo@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000024c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000024e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000024a1', '00000000-0000-4000-8000-00000024c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000024b2', '00000000-0000-4000-8000-00000024c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000024c3', '00000000-0000-4000-8000-00000024c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000024e5', '00000000-0000-4000-8000-00000024c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000024f1', '00000000-0000-4000-8000-00000024c1a5'),
  ('00000000-0000-4000-8000-0000000024f2', '00000000-0000-4000-8000-00000024c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000024f1', '00000000-0000-4000-8000-0000000024a1'),
  ('00000000-0000-4000-8000-0000000024f1', '00000000-0000-4000-8000-0000000024b2'),
  ('00000000-0000-4000-8000-0000000024f2', '00000000-0000-4000-8000-0000000024c3');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000240001', '00000000-0000-4000-8000-0000000024f1', 'Group talk',
   '00000000-0000-4000-8000-0000000024a1'),
  ('00000000-0000-4000-8000-000000240002', '00000000-0000-4000-8000-0000000024f2', 'Other group',
   '00000000-0000-4000-8000-0000000024c3');

-- The main poll's id is passed between the blocks below in the setting
-- test.poll (transaction-local).


-- =============================================================================
-- As A: creates polls (and is refused bad ones), answers, can't write directly
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000024a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a   constant uuid := '00000000-0000-4000-8000-0000000024a1';
  p   constant uuid := '00000000-0000-4000-8000-000000240001';
  q   constant uuid := '00000000-0000-4000-8000-000000240002';
  t1  constant timestamptz := now() + interval '2 days';
  t2  constant timestamptz := now() + interval '3 days';
  t3  constant timestamptz := now() + interval '4 days';
  poll uuid;
  o1  uuid;
begin
  -- Times: 2–8, distinct, in the future.
  begin
    perform public.create_meeting_poll(p, 'One time', 30, null, array[t1]);
    raise exception 'FAIL: a poll with one time was created';
  exception when sqlstate 'SP013' then null;
  end;
  begin
    perform public.create_meeting_poll(p, 'Same time', 30, null, array[t1, t1]);
    raise exception 'FAIL: a poll with the same time twice was created';
  exception when sqlstate 'SP013' then null;
  end;
  begin
    perform public.create_meeting_poll(p, 'Past', 30, null, array[now() - interval '1 hour', t1]);
    raise exception 'FAIL: a poll with a past time was created';
  exception when sqlstate 'SP013' then null;
  end;
  -- 0034: 20 times are allowed, 21 are not.
  perform public.create_meeting_poll(p, 'Twenty', 30, null,
    array(select now() + make_interval(hours => g) from generate_series(1, 20) g));
  begin
    perform public.create_meeting_poll(p, 'Too many', 30, null,
      array(select now() + make_interval(days => g) from generate_series(1, 21) g));
    raise exception 'FAIL: a poll with 21 times was created (0034: at most 20)';
  exception when sqlstate 'SP013' then null;
  end;
  begin
    perform public.create_meeting_poll(p, 'Late', 30, now() - interval '1 minute', array[t1, t2]);
    raise exception 'FAIL: a poll with a past answer-by time was created';
  exception when sqlstate 'SP013' then null;
  end;
  begin
    perform public.create_meeting_poll(p, '   ', 30, null, array[t1, t2]);
    raise exception 'FAIL: a poll with a blank title was created';
  exception when check_violation then null;
  end;
  begin
    perform public.create_meeting_poll(p, 'Too long', 600, null, array[t1, t2]);
    raise exception 'FAIL: a 10-hour meeting was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_meeting_poll(q, 'Not my pod', 30, null, array[t1, t2]);
    raise exception 'FAIL: A created a poll in another pod''s project';
  exception when insufficient_privilege then null;
  end;

  -- No direct writes to polls or times.
  begin
    insert into public.meeting_polls (project_id, created_by, title) values (p, a, 'direct');
    raise exception 'FAIL: A inserted a poll directly';
  exception when insufficient_privilege then null;
  end;

  poll := public.create_meeting_poll(p, '  Midway check  ', 30, now() + interval '1 day', array[t1, t2, t3]);
  perform set_config('test.poll', poll::text, true);
  if (select title from public.meeting_polls where id = poll) <> 'Midway check'
     or (select count(*) from public.meeting_poll_options where poll_id = poll) <> 3 then
    raise exception 'FAIL: the poll or its 3 times were not saved as given';
  end if;
  begin
    insert into public.meeting_poll_options (poll_id, starts_at) values (poll, now() + interval '9 days');
    raise exception 'FAIL: A added a time directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.meeting_polls set status = 'confirmed' where id = poll;
    raise exception 'FAIL: A confirmed a poll directly';
  exception when insufficient_privilege then null;
  end;

  -- Answers: my own, one per time, changeable.
  select id into o1 from public.meeting_poll_options where poll_id = poll and starts_at = t1;
  insert into public.meeting_poll_votes (option_id, user_id, answer) values (o1, a, 'maybe');
  update public.meeting_poll_votes set answer = 'yes' where option_id = o1 and user_id = a;
  if (select answer from public.meeting_poll_votes where option_id = o1 and user_id = a) <> 'yes' then
    raise exception 'FAIL: A could not change their answer';
  end if;
  begin
    insert into public.meeting_poll_votes (option_id, user_id, answer) values (o1, a, 'no');
    raise exception 'FAIL: A answered the same time twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.meeting_poll_votes (option_id, user_id, answer)
    values (o1, '00000000-0000-4000-8000-0000000024b2', 'yes');
    raise exception 'FAIL: A answered in B''s name';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.meeting_poll_votes (option_id, user_id, answer)
    select id, a, 'sure' from public.meeting_poll_options where poll_id = poll and starts_at = t2;
    raise exception 'FAIL: an answer other than yes/maybe/no was saved';
  exception when check_violation then null;
  end;
  begin
    update public.meeting_poll_votes set user_id = '00000000-0000-4000-8000-0000000024b2'
     where option_id = o1 and user_id = a;
    raise exception 'FAIL: an answer moved to another voter';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As B (podmate): sees the poll and A's answers, answers, confirms
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000024b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  b    constant uuid := '00000000-0000-4000-8000-0000000024b2';
  poll uuid := current_setting('test.poll')::uuid;
  o1   uuid;
  o3   uuid;
  n    integer;
begin
  if (select count(*) from public.meeting_polls where id = poll) <> 1
     or (select count(*) from public.meeting_poll_options where poll_id = poll) <> 3 then
    raise exception 'FAIL: B cannot see the pod''s poll and times';
  end if;
  if (select count(*) from public.meeting_poll_votes) <> 1 then
    raise exception 'FAIL: B cannot see A''s answer';
  end if;

  select id into o1 from public.meeting_poll_options where poll_id = poll order by starts_at limit 1;
  select id into o3 from public.meeting_poll_options where poll_id = poll order by starts_at desc limit 1;

  -- A's answer is A's.
  update public.meeting_poll_votes set answer = 'no' where option_id = o1 and user_id <> b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed A''s answer'; end if;
  delete from public.meeting_poll_votes where option_id = o1 and user_id <> b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s answer'; end if;

  insert into public.meeting_poll_votes (option_id, user_id, answer) values (o1, b, 'yes');
  insert into public.meeting_poll_votes (option_id, user_id, answer) values (o3, b, 'no');
  delete from public.meeting_poll_votes where option_id = o3 and user_id = b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B could not take back their answer'; end if;

  -- Confirming: a time of this poll only.
  begin
    perform public.confirm_meeting_poll(poll, gen_random_uuid());
    raise exception 'FAIL: a poll was confirmed with a time not in it';
  exception when insufficient_privilege then null;
  end;
  perform public.confirm_meeting_poll(poll, o1);
  if (select status from public.meeting_polls where id = poll) <> 'confirmed'
     or (select chosen_option_id from public.meeting_polls where id = poll) <> o1 then
    raise exception 'FAIL: the poll was not confirmed on the chosen time';
  end if;
  begin
    perform public.confirm_meeting_poll(poll, o3);
    raise exception 'FAIL: a confirmed poll was confirmed again';
  exception when sqlstate 'SP012' then null;
  end;

  -- Closed: answers can't change any more.
  begin
    insert into public.meeting_poll_votes (option_id, user_id, answer) values (o3, b, 'yes');
    raise exception 'FAIL: B answered a confirmed poll';
  exception when insufficient_privilege then null;
  end;
  update public.meeting_poll_votes set answer = 'no' where option_id = o1 and user_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed an answer on a confirmed poll'; end if;

  -- Plans change: a confirmed meeting can be called off, once.
  perform public.cancel_meeting_poll(poll);
  if (select status from public.meeting_polls where id = poll) <> 'cancelled'
     or (select chosen_option_id from public.meeting_polls where id = poll) is not null then
    raise exception 'FAIL: cancelling did not clear the meeting';
  end if;
  begin
    perform public.cancel_meeting_poll(poll);
    raise exception 'FAIL: a cancelled poll was cancelled again';
  exception when sqlstate 'SP012' then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As C (another pod) — sees and changes nothing of P's
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000024c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  c    constant uuid := '00000000-0000-4000-8000-0000000024c3';
  poll uuid := current_setting('test.poll')::uuid;
  o1   uuid;
begin
  if (select count(*) from public.meeting_polls) <> 0
     or (select count(*) from public.meeting_poll_options) <> 0
     or (select count(*) from public.meeting_poll_votes) <> 0 then
    raise exception 'FAIL: a student in another pod can read P''s polls';
  end if;
  -- The option id, read as the owner would know it (an attacker guessing ids).
  select id into o1 from public.meeting_poll_options limit 1;
  if o1 is not null then raise exception 'FAIL: C read an option id'; end if;
  begin
    perform public.confirm_meeting_poll(poll, gen_random_uuid());
    raise exception 'FAIL: a student in another pod confirmed P''s poll';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cancel_meeting_poll(poll);
    raise exception 'FAIL: a student in another pod cancelled P''s poll';
  exception when insufficient_privilege then null;
  end;
  if public.is_poll_member(poll) then
    raise exception 'FAIL: is_poll_member is true for another pod';
  end if;
end $$;

reset role;

-- C can't answer P's times even knowing an id (checked as the owner fetches one).
do $$
declare
  o uuid := (select o.id from public.meeting_poll_options o
              where o.poll_id = current_setting('test.poll')::uuid limit 1);
begin
  perform set_config('test.option', o::text, true);
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000024c3","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.meeting_poll_votes (option_id, user_id, answer)
  values (current_setting('test.option')::uuid, '00000000-0000-4000-8000-0000000024c3', 'yes');
  raise exception 'FAIL: a student in another pod answered P''s poll';
exception when insufficient_privilege then null;
end $$;

reset role;


-- =============================================================================
-- As O (organizer) — never in a pod, sees and does nothing
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000024e5","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.meeting_polls) <> 0
     or (select count(*) from public.meeting_poll_votes) <> 0 then
    raise exception 'FAIL: an organizer can read polls';
  end if;
  begin
    perform public.create_meeting_poll('00000000-0000-4000-8000-000000240001', 'Org', 30, null,
      array[now() + interval '1 day', now() + interval '2 days']);
    raise exception 'FAIL: an organizer created a poll';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- Logged out (anon) — nothing
-- =============================================================================

set local role anon;

do $$
begin
  begin perform 1 from public.meeting_polls; raise exception 'FAIL: anon read polls';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.meeting_poll_options; raise exception 'FAIL: anon read times';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.meeting_poll_votes; raise exception 'FAIL: anon read answers';
  exception when insufficient_privilege then null; end;
  begin perform public.create_meeting_poll('00000000-0000-4000-8000-000000240001', 'x', 30, null,
      array[now() + interval '1 day', now() + interval '2 days']);
    raise exception 'FAIL: anon called create_meeting_poll';
  exception when insufficient_privilege then null; end;
  begin perform public.confirm_meeting_poll(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon called confirm_meeting_poll';
  exception when insufficient_privilege then null; end;
end $$;

reset role;


-- =============================================================================
-- Cascades (as the owner)
-- =============================================================================

do $$
begin
  -- B's account goes: B's answers go with it.
  delete from auth.users where id = '00000000-0000-4000-8000-0000000024b2';
  if exists (select 1 from public.meeting_poll_votes where user_id = '00000000-0000-4000-8000-0000000024b2') then
    raise exception 'FAIL: a deleted account''s answers stayed';
  end if;
  -- The project goes: its polls, times and answers go with it.
  delete from public.projects where id = '00000000-0000-4000-8000-000000240001';
  if exists (select 1 from public.meeting_polls where project_id = '00000000-0000-4000-8000-000000240001')
     or exists (select 1 from public.meeting_poll_options o where o.poll_id = current_setting('test.poll')::uuid) then
    raise exception 'FAIL: deleting a project left polls or times behind';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
