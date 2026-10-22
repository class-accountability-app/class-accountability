-- =============================================================================
-- rls_group_projects.sql — RLS tests for 0022 (projects, tasks, progress, check-ins)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class and
-- pods, impersonates each user the way PostgREST does (role + JWT claims), and
-- checks what the database allows. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — class K, same pod F1 (A starts the project P)
--   C    — class K, student with no pod
--   D    — class K, alone in pod F2 (starts their own project Q)
--   O    — organizer of K (never in a pod)
--
-- How to run: see "RLS tests" in CLAUDE.md. Before and after, count auth.users,
-- profiles and nudges and confirm they match.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000022a1', 'rls-test-ga@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022b2', 'rls-test-gb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022c3', 'rls-test-gc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022d4', 'rls-test-gd@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022e5', 'rls-test-go@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000022c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000022e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000022a1', '00000000-0000-4000-8000-00000022c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000022b2', '00000000-0000-4000-8000-00000022c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000022c3', '00000000-0000-4000-8000-00000022c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000022d4', '00000000-0000-4000-8000-00000022c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000022e5', '00000000-0000-4000-8000-00000022c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000022f1', '00000000-0000-4000-8000-00000022c1a5'),
  ('00000000-0000-4000-8000-0000000022f2', '00000000-0000-4000-8000-00000022c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000022f1', '00000000-0000-4000-8000-0000000022a1'),
  ('00000000-0000-4000-8000-0000000022f1', '00000000-0000-4000-8000-0000000022b2'),
  ('00000000-0000-4000-8000-0000000022f2', '00000000-0000-4000-8000-0000000022d4');

-- The check-in round is a pure function: Tokyo days, counted from the start.
do $$
begin
  if public.checkin_round_start('2026-10-01', 4, '2026-10-01') <> '2026-10-01'
     or public.checkin_round_start('2026-10-01', 4, '2026-10-04') <> '2026-10-01'
     or public.checkin_round_start('2026-10-01', 4, '2026-10-05') <> '2026-10-05'
     or public.checkin_round_start('2026-10-01', 4, '2026-10-12') <> '2026-10-09'
     or public.checkin_round_start('2026-10-01', 4, '2026-09-20') <> '2026-10-01' then
    raise exception 'FAIL: checkin_round_start gives the wrong round';
  end if;
end $$;


-- =============================================================================
-- As A (starts the project; owns the script task)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a    constant uuid := '00000000-0000-4000-8000-0000000022a1';
  b    constant uuid := '00000000-0000-4000-8000-0000000022b2';
  c    constant uuid := '00000000-0000-4000-8000-0000000022c3';
  f1   constant uuid := '00000000-0000-4000-8000-0000000022f1';
  f2   constant uuid := '00000000-0000-4000-8000-0000000022f2';
  p    constant uuid := '00000000-0000-4000-8000-000000220001';
  t1   constant uuid := '00000000-0000-4000-8000-000000220101';
  t2   constant uuid := '00000000-0000-4000-8000-000000220102';
  t3   constant uuid := '00000000-0000-4000-8000-000000220103';
  l1   constant uuid := '00000000-0000-4000-8000-000000220201';
  l2   constant uuid := '00000000-0000-4000-8000-000000220202';
  ck   uuid;
  n    integer;
begin
  -- Starting a project: only for my own pod, only as myself, one per pod.
  begin
    insert into public.projects (pairing_id, title, created_by) values (f2, 'not my pod', a);
    raise exception 'FAIL: A started a project in a pod A is not in';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.projects (pairing_id, title, created_by) values (f1, 'forged', b);
    raise exception 'FAIL: A started a project in B''s name';
  exception when insufficient_privilege then null;
  end;

  insert into public.projects (id, pairing_id, title, created_by) values (p, f1, 'Group talk', a);

  begin
    insert into public.projects (pairing_id, title, created_by) values (f1, 'second', a);
    raise exception 'FAIL: a pod got two projects';
  exception when unique_violation then null;
  end;

  begin
    update public.projects set start_date = start_date + 1 where id = p;
    raise exception 'FAIL: a project''s start date changed';
  exception when insufficient_privilege then null;
  end;

  -- Tasks: any member adds them; an owner must be in the pod.
  insert into public.project_tasks (id, project_id, title, owner_id, metric, target_amount) values
    (t1, p, 'Script', a, 'characters', 2400);
  insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount) values
    (t2, p, 'Slides', b, 'count', 'slides', 10);
  insert into public.project_tasks (id, project_id, title) values (t3, p, 'Collect data');

  begin
    insert into public.project_tasks (project_id, title, owner_id) values (p, 'bad owner', c);
    raise exception 'FAIL: a task was given to someone outside the pod';
  exception when sqlstate 'SP009' then null;
  end;
  begin
    insert into public.project_tasks (project_id, title, metric) values (p, 'no unit', 'count');
    raise exception 'FAIL: a count task without a unit was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_tasks (project_id, title, metric, target_amount) values (p, 'status with goal', 'status', 5);
    raise exception 'FAIL: a status task with a goal was saved';
  exception when check_violation then null;
  end;

  -- A teammate's task can be edited by any member (status).
  update public.project_tasks set status = 'doing' where id = t2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not update a teammate''s task status'; end if;

  -- Logging: my task, as me, manual only, server time, idempotent.
  insert into public.task_progress (id, task_id, user_id, progress_value, client_id, logged_at)
  values (l1, t1, a, 300, '00000000-0000-4000-8000-000000220301', '2000-01-01 00:00:00+00');
  if (select logged_at from public.task_progress where id = l1) < '2020-01-01' then
    raise exception 'FAIL: a student''s log kept a client-supplied time';
  end if;
  begin
    insert into public.task_progress (task_id, user_id, progress_value, client_id)
    values (t1, a, 5, '00000000-0000-4000-8000-000000220301');
    raise exception 'FAIL: the same client_id was saved twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t2, a, 1);
    raise exception 'FAIL: A logged on B''s task';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t3, a, 1);
    raise exception 'FAIL: A logged on a task nobody owns';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t1, b, 1);
    raise exception 'FAIL: A logged in B''s name';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value, source) values (t1, a, 1, 'document');
    raise exception 'FAIL: A wrote a document-source log';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t1, a, 0);
    raise exception 'FAIL: a log with amount 0 was saved';
  exception when check_violation then null;
  end;

  -- Edit amount and note; nothing else; delete my own.
  update public.task_progress set progress_value = 320, note = 'edited' where id = l1;
  begin
    update public.task_progress set task_id = t2 where id = l1;
    raise exception 'FAIL: a log moved to another task';
  exception when insufficient_privilege then null;
  end;
  insert into public.task_progress (id, task_id, user_id, progress_value) values (l2, t1, a, 10);
  delete from public.task_progress where id = l2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not delete their own log'; end if;

  -- Check-ins are written only by submit_checkin, once per round.
  begin
    insert into public.project_checkins (project_id, user_id, round_start, snapshot)
    values (p, a, current_date, '[]');
    raise exception 'FAIL: A inserted a check-in directly';
  exception when insufficient_privilege then null;
  end;

  ck := public.submit_checkin(p, '  on track  ');
  if ck is null then raise exception 'FAIL: submit_checkin returned nothing'; end if;
  begin
    perform public.submit_checkin(p, 'again');
    raise exception 'FAIL: A checked in twice in one round';
  exception when sqlstate 'SP008' then null;
  end;

  select count(*) into n from public.project_checkins
   where id = ck and note = 'on track'
     and jsonb_array_length(snapshot) = 1
     and snapshot->0->>'title' = 'Script'
     and (snapshot->0->>'total')::numeric = 320;
  if n <> 1 then raise exception 'FAIL: A''s snapshot is not their own tasks with the right total'; end if;

  begin
    update public.project_checkins set note = 'edited' where id = ck;
    raise exception 'FAIL: A edited a check-in';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.project_tasks where project_id = p;
  if n <> 3 then raise exception 'FAIL: A should see 3 tasks, saw %', n; end if;
end $$;

reset role;


-- =============================================================================
-- As B (podmate: sees tasks and check-ins, not A's running numbers)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p    constant uuid := '00000000-0000-4000-8000-000000220001';
  t1   constant uuid := '00000000-0000-4000-8000-000000220101';
  t2   constant uuid := '00000000-0000-4000-8000-000000220102';
  l1   constant uuid := '00000000-0000-4000-8000-000000220201';
  lb   constant uuid := '00000000-0000-4000-8000-000000220203';
  b    constant uuid := '00000000-0000-4000-8000-0000000022b2';
  n    integer;
begin
  if (select count(*) from public.projects where id = p) <> 1 then
    raise exception 'FAIL: B cannot see their pod''s project';
  end if;
  if (select count(*) from public.project_tasks where project_id = p) <> 3 then
    raise exception 'FAIL: B cannot see all the tasks';
  end if;

  -- A's raw progress is A's: B sees none of it, even the total.
  if (select count(*) from public.task_progress where task_id = t1) <> 0 then
    raise exception 'FAIL: B can read A''s progress entries';
  end if;
  update public.task_progress set progress_value = 1 where id = l1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B edited A''s log'; end if;
  delete from public.task_progress where id = l1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s log'; end if;

  -- A's check-in is the pod's to read.
  if (select count(*) from public.project_checkins where project_id = p) <> 1 then
    raise exception 'FAIL: B cannot read A''s check-in';
  end if;

  -- Only the creator deletes the project.
  delete from public.projects where id = p;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s project'; end if;

  -- B logs on their own task and checks in.
  insert into public.task_progress (id, task_id, user_id, progress_value) values (lb, t2, b, 4);
  begin
    perform public.submit_checkin(p, repeat('x', 281));
    raise exception 'FAIL: a 281-character check-in note was saved';
  exception when check_violation then null;
  end;
  perform public.submit_checkin(p, null);
  if (select count(*) from public.project_checkins where project_id = p) <> 2 then
    raise exception 'FAIL: B should now see 2 check-ins';
  end if;
end $$;

reset role;


-- =============================================================================
-- As A again (B's numbers stay B's)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  t2 constant uuid := '00000000-0000-4000-8000-000000220102';
begin
  if (select count(*) from public.task_progress where task_id = t2) <> 0 then
    raise exception 'FAIL: A can read B''s progress entries';
  end if;
  if (select count(*) from public.project_checkins) <> 2 then
    raise exception 'FAIL: A should see both check-ins';
  end if;
end $$;

reset role;


-- =============================================================================
-- As C (classmate with no pod) — sees and writes nothing
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  f1 constant uuid := '00000000-0000-4000-8000-0000000022f1';
  c  constant uuid := '00000000-0000-4000-8000-0000000022c3';
  p  constant uuid := '00000000-0000-4000-8000-000000220001';
  t1 constant uuid := '00000000-0000-4000-8000-000000220101';
begin
  if (select count(*) from public.projects) <> 0
     or (select count(*) from public.project_tasks) <> 0
     or (select count(*) from public.task_progress) <> 0
     or (select count(*) from public.project_checkins) <> 0 then
    raise exception 'FAIL: a student outside the pod can read project data';
  end if;
  begin
    insert into public.project_tasks (project_id, title) values (p, 'sneaky');
    raise exception 'FAIL: an outsider added a task';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.projects (pairing_id, title, created_by) values (f1, 'sneaky', c);
    raise exception 'FAIL: an outsider started a project in a pod';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t1, c, 1);
    raise exception 'FAIL: an outsider logged progress';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_checkin(p, 'sneaky');
    raise exception 'FAIL: an outsider checked in';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As D (another pod: their own project, none of A's)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022d4","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a  constant uuid := '00000000-0000-4000-8000-0000000022a1';
  d  constant uuid := '00000000-0000-4000-8000-0000000022d4';
  f2 constant uuid := '00000000-0000-4000-8000-0000000022f2';
  q  constant uuid := '00000000-0000-4000-8000-000000220002';
begin
  insert into public.projects (id, pairing_id, title, created_by) values (q, f2, 'Other group', d);
  if (select count(*) from public.projects) <> 1 then
    raise exception 'FAIL: D should see only their own pod''s project';
  end if;
  if (select count(*) from public.project_tasks) <> 0
     or (select count(*) from public.project_checkins) <> 0 then
    raise exception 'FAIL: D can see another pod''s tasks or check-ins';
  end if;
  begin
    insert into public.project_tasks (project_id, title, owner_id) values (q, 'bad owner', a);
    raise exception 'FAIL: D gave a task to someone in another pod';
  exception when sqlstate 'SP009' then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As O (organizer) — never part of a pod, sees nothing
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022e5","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  f1 constant uuid := '00000000-0000-4000-8000-0000000022f1';
  o  constant uuid := '00000000-0000-4000-8000-0000000022e5';
begin
  if (select count(*) from public.projects) <> 0
     or (select count(*) from public.project_tasks) <> 0
     or (select count(*) from public.task_progress) <> 0
     or (select count(*) from public.project_checkins) <> 0 then
    raise exception 'FAIL: an organizer can read project data';
  end if;
  begin
    insert into public.projects (pairing_id, title, created_by) values (f1, 'org', o);
    raise exception 'FAIL: an organizer started a project';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- Logged out (anon) — no table is readable
-- =============================================================================

set local role anon;

do $$
begin
  begin perform 1 from public.projects; raise exception 'FAIL: anon read projects';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.project_tasks; raise exception 'FAIL: anon read tasks';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.task_progress; raise exception 'FAIL: anon read progress';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.project_checkins; raise exception 'FAIL: anon read check-ins';
  exception when insufficient_privilege then null; end;
  begin perform public.submit_checkin('00000000-0000-4000-8000-000000220001', null);
    raise exception 'FAIL: anon called submit_checkin';
  exception when insufficient_privilege then null; end;
end $$;

reset role;


-- =============================================================================
-- Leaving, and deleting the project (as the owner, to look at the result)
-- =============================================================================

do $$
declare
  p  constant uuid := '00000000-0000-4000-8000-000000220001';
  t1 constant uuid := '00000000-0000-4000-8000-000000220101';
  t2 constant uuid := '00000000-0000-4000-8000-000000220102';
  l1 constant uuid := '00000000-0000-4000-8000-000000220201';
  lb constant uuid := '00000000-0000-4000-8000-000000220203';
begin
  -- B's attempted edits and deletes changed nothing.
  if (select progress_value from public.task_progress where id = l1) <> 320 then
    raise exception 'FAIL: A''s log was changed by someone else';
  end if;
  if not exists (select 1 from public.projects where id = p) then
    raise exception 'FAIL: the project was deleted by a non-creator';
  end if;

  -- B leaves the pod: their task is unowned, their numbers and the project stay.
  delete from public.pairing_members
   where pairing_id = '00000000-0000-4000-8000-0000000022f1'
     and user_id = '00000000-0000-4000-8000-0000000022b2';
  if (select owner_id from public.project_tasks where id = t2) is not null then
    raise exception 'FAIL: a task kept its owner after they left the pod';
  end if;
  if (select owner_id from public.project_tasks where id = t1) is null then
    raise exception 'FAIL: a task lost its owner when someone else left';
  end if;
  if not exists (select 1 from public.task_progress where id = lb) then
    raise exception 'FAIL: leaving the pod deleted the leaver''s progress';
  end if;
end $$;

-- The creator deletes the project; its tasks, progress and check-ins go with it.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000022a1","role":"authenticated"}', true);
set local role authenticated;
delete from public.projects where id = '00000000-0000-4000-8000-000000220001';
reset role;

do $$
begin
  if exists (select 1 from public.project_tasks where project_id = '00000000-0000-4000-8000-000000220001')
     or exists (select 1 from public.task_progress where id in
                ('00000000-0000-4000-8000-000000220201', '00000000-0000-4000-8000-000000220203'))
     or exists (select 1 from public.project_checkins where project_id = '00000000-0000-4000-8000-000000220001') then
    raise exception 'FAIL: deleting a project left tasks, progress or check-ins behind';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
