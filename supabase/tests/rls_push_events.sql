-- =============================================================================
-- rls_push_events.sql — RLS and queue tests for 0025 (meeting reminders,
-- stalled-task pushes)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK. It creates throwaway users, a class,
-- pods, projects, tasks and polls, checks that no client can read push_events
-- or run the queue functions, then runs the queue functions as pg_cron would
-- (the table owner) and checks who is owed which push. It never calls
-- private.send_push_events(), so nothing is sent.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — class K, same pod F1, project P (live)
--   C    — class K, alone in pod F2, project Q (deadline passed)
--
-- How to run: see "RLS tests" in CLAUDE.md. Before and after, count auth.users,
-- profiles and nudges and confirm they match.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000025a1', 'rls-test-pa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000025b2', 'rls-test-pb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000025c3', 'rls-test-pc@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000025c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000025c3');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000025a1', '00000000-0000-4000-8000-00000025c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000025b2', '00000000-0000-4000-8000-00000025c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000025c3', '00000000-0000-4000-8000-00000025c1a5', 'student');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000025f1', '00000000-0000-4000-8000-00000025c1a5'),
  ('00000000-0000-4000-8000-0000000025f2', '00000000-0000-4000-8000-00000025c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000025f1', '00000000-0000-4000-8000-0000000025a1'),
  ('00000000-0000-4000-8000-0000000025f1', '00000000-0000-4000-8000-0000000025b2'),
  ('00000000-0000-4000-8000-0000000025f2', '00000000-0000-4000-8000-0000000025c3');

-- P is live; Q's deadline has passed (its stalled task is left alone).
insert into public.projects (id, pairing_id, title, created_by, start_date, deadline) values
  ('00000000-0000-4000-8000-000000250001', '00000000-0000-4000-8000-0000000025f1', 'Group talk',
   '00000000-0000-4000-8000-0000000025a1', (now() at time zone 'Asia/Tokyo')::date, null),
  ('00000000-0000-4000-8000-000000250002', '00000000-0000-4000-8000-0000000025f2', 'Finished group',
   '00000000-0000-4000-8000-0000000025c3', (now() at time zone 'Asia/Tokyo')::date - 20,
   (now() at time zone 'Asia/Tokyo')::date - 2);

-- Tasks, all created 10 days ago.
insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount, status, created_at) values
  -- A: last entry 4 days ago → stalled
  ('00000000-0000-4000-8000-000000250101', '00000000-0000-4000-8000-000000250001', 'Slides',
   '00000000-0000-4000-8000-0000000025a1', 'count', 'slides', 10, 'doing', now() - interval '10 days'),
  -- A: entry yesterday → fine
  ('00000000-0000-4000-8000-000000250102', '00000000-0000-4000-8000-000000250001', 'Script',
   '00000000-0000-4000-8000-0000000025a1', 'characters', null, 2400, 'doing', now() - interval '10 days'),
  -- A: done → never
  ('00000000-0000-4000-8000-000000250103', '00000000-0000-4000-8000-000000250001', 'Outline',
   '00000000-0000-4000-8000-0000000025a1', 'count', 'pages', 2, 'done', now() - interval '10 days'),
  -- A: status only → no numbers to stall on
  ('00000000-0000-4000-8000-000000250104', '00000000-0000-4000-8000-000000250001', 'Book a room',
   '00000000-0000-4000-8000-0000000025a1', 'status', null, null, 'todo', now() - interval '10 days'),
  -- nobody's → nobody to tell
  ('00000000-0000-4000-8000-000000250105', '00000000-0000-4000-8000-000000250001', 'Handout',
   null, 'count', 'pages', 1, 'todo', now() - interval '10 days'),
  -- B: no entries since it was created → stalled
  ('00000000-0000-4000-8000-000000250106', '00000000-0000-4000-8000-000000250001', 'Data',
   '00000000-0000-4000-8000-0000000025b2', 'count', 'rows', 100, 'todo', now() - interval '10 days'),
  -- C: stalled, but Q's deadline has passed
  ('00000000-0000-4000-8000-000000250107', '00000000-0000-4000-8000-000000250002', 'Report',
   '00000000-0000-4000-8000-0000000025c3', 'characters', null, 1000, 'doing', now() - interval '10 days');

insert into public.task_progress (task_id, user_id, progress_value, logged_at) values
  ('00000000-0000-4000-8000-000000250101', '00000000-0000-4000-8000-0000000025a1', 3, now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000250102', '00000000-0000-4000-8000-0000000025a1', 400, now() - interval '1 day');


-- =============================================================================
-- Clients: no way in
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000025a1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin perform 1 from public.push_events; raise exception 'FAIL: a student read push_events';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.push_events (user_id, kind, ref_key, task_id)
    values ('00000000-0000-4000-8000-0000000025b2', 'task_stalled', 'x', '00000000-0000-4000-8000-000000250106');
    raise exception 'FAIL: a student queued a push';
  exception when insufficient_privilege then null; end;
  begin perform private.queue_meeting_reminders(); raise exception 'FAIL: a student ran queue_meeting_reminders';
  exception when insufficient_privilege then null; end;
  begin perform private.queue_stalled_tasks(); raise exception 'FAIL: a student ran queue_stalled_tasks';
  exception when insufficient_privilege then null; end;
  begin perform private.send_push_events(); raise exception 'FAIL: a student ran send_push_events';
  exception when insufficient_privilege then null; end;
end $$;

-- A sets up the meetings: one tomorrow-ish (3 hours away), one in 30 minutes
-- (too late to remind), one more than a day away, one called off. A checks in.
do $$
declare
  p constant uuid := '00000000-0000-4000-8000-000000250001';
  poll uuid;
begin
  poll := public.create_meeting_poll(p, 'Soon', 30, null, array[now() + interval '3 hours', now() + interval '5 hours']);
  perform public.confirm_meeting_poll(poll, (select id from public.meeting_poll_options where poll_id = poll order by starts_at limit 1));
  perform set_config('test.soon', poll::text, true);

  poll := public.create_meeting_poll(p, 'Now', 30, null, array[now() + interval '30 minutes', now() + interval '6 hours']);
  perform public.confirm_meeting_poll(poll, (select id from public.meeting_poll_options where poll_id = poll order by starts_at limit 1));

  poll := public.create_meeting_poll(p, 'Later', 30, null, array[now() + interval '30 hours', now() + interval '40 hours']);
  perform public.confirm_meeting_poll(poll, (select id from public.meeting_poll_options where poll_id = poll order by starts_at limit 1));

  poll := public.create_meeting_poll(p, 'Off', 30, null, array[now() + interval '4 hours', now() + interval '7 hours']);
  perform public.confirm_meeting_poll(poll, (select id from public.meeting_poll_options where poll_id = poll order by starts_at limit 1));
  perform public.cancel_meeting_poll(poll);

  perform public.submit_checkin(p, null);
end $$;

reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.push_events; raise exception 'FAIL: anon read push_events';
  exception when insufficient_privilege then null; end;
  begin perform private.queue_stalled_tasks(); raise exception 'FAIL: anon ran queue_stalled_tasks';
  exception when insufficient_privilege then null; end;
end $$;
reset role;


-- =============================================================================
-- pg_cron (as the owner): who is owed what
-- =============================================================================

do $$
declare
  a    constant uuid := '00000000-0000-4000-8000-0000000025a1';
  b    constant uuid := '00000000-0000-4000-8000-0000000025b2';
  soon constant uuid := current_setting('test.soon')::uuid;
  n    integer;
begin
  -- Meetings: only "Soon", for both members; B still has to check in, A doesn't.
  n := private.queue_meeting_reminders();
  if n <> 2 then raise exception 'FAIL: expected 2 meeting reminders, got %', n; end if;
  if (select count(*) from public.push_events where kind = 'meeting_reminder' and poll_id <> soon) <> 0 then
    raise exception 'FAIL: a reminder was queued for a meeting too soon, too far or called off';
  end if;
  if (select needs_checkin from public.push_events where kind = 'meeting_reminder' and user_id = a)
     or not (select needs_checkin from public.push_events where kind = 'meeting_reminder' and user_id = b) then
    raise exception 'FAIL: needs_checkin is wrong (A checked in, B did not)';
  end if;
  n := private.queue_meeting_reminders();
  if n <> 0 then raise exception 'FAIL: the same meeting was queued twice'; end if;

  -- Stalled: A's Slides and B's Data, each to its owner only.
  n := private.queue_stalled_tasks();
  if n <> 2 then raise exception 'FAIL: expected 2 stalled-task pushes, got %', n; end if;
  if not exists (select 1 from public.push_events where kind = 'task_stalled' and user_id = a
                  and task_id = '00000000-0000-4000-8000-000000250101')
     or not exists (select 1 from public.push_events where kind = 'task_stalled' and user_id = b
                  and task_id = '00000000-0000-4000-8000-000000250106') then
    raise exception 'FAIL: the stalled pushes are not for the right task and owner';
  end if;
  if exists (select 1 from public.push_events e join public.project_tasks t on t.id = e.task_id
              where e.kind = 'task_stalled' and e.user_id <> t.owner_id) then
    raise exception 'FAIL: a stalled push went to someone other than the owner';
  end if;
  n := private.queue_stalled_tasks();
  if n <> 0 then raise exception 'FAIL: the same stall was queued twice'; end if;

  -- Slides moves (an entry 3 days and 1 hour ago), then stalls again: a new push.
  insert into public.task_progress (task_id, user_id, progress_value, logged_at)
  values ('00000000-0000-4000-8000-000000250101', a, 1, now() - interval '3 days 1 hour');
  n := private.queue_stalled_tasks();
  if n <> 1 then raise exception 'FAIL: a new stall after progress was not queued (got %)', n; end if;

  -- The table's own rules.
  begin
    insert into public.push_events (user_id, kind, ref_key, task_id)
    values (a, 'meeting_reminder', 'bad', '00000000-0000-4000-8000-000000250101');
    raise exception 'FAIL: a meeting reminder without a poll was saved';
  exception when check_violation then null;
  end;

  -- Cascades: a deleted task or poll takes its pushes; so does a deleted account.
  delete from public.project_tasks where id = '00000000-0000-4000-8000-000000250106';
  if exists (select 1 from public.push_events where task_id = '00000000-0000-4000-8000-000000250106') then
    raise exception 'FAIL: a deleted task''s push stayed';
  end if;
  delete from public.meeting_polls where id = soon;
  if exists (select 1 from public.push_events where poll_id = soon) then
    raise exception 'FAIL: a deleted poll''s reminders stayed';
  end if;
  delete from auth.users where id = a;
  if exists (select 1 from public.push_events where user_id = a) then
    raise exception 'FAIL: a deleted account''s pushes stayed';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
