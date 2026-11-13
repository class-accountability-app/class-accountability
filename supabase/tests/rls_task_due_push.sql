-- =============================================================================
-- rls_task_due_push.sql — tests for 0048 (a push the day before a task is due)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
-- It calls the queue function only, never send_push_events(), so nothing is
-- sent. Cast (all @andrew.ac.jp): A, B teammates in team F with project J.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000048a1', 'rls-test-da@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000048b2', 'rls-test-db@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000048e5', 'rls-test-do@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000048c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000048e5');
insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000048a1', '00000000-0000-4000-8000-00000048c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000048b2', '00000000-0000-4000-8000-00000048c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000048e5', '00000000-0000-4000-8000-00000048c1a5', 'organizer')
on conflict (user_id, class_id) do nothing;
insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000048f1', '00000000-0000-4000-8000-00000048c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000048f1', '00000000-0000-4000-8000-0000000048a1'),
  ('00000000-0000-4000-8000-0000000048f1', '00000000-0000-4000-8000-0000000048b2');
insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000480001', '00000000-0000-4000-8000-0000000048f1', 'J',
   '00000000-0000-4000-8000-0000000048a1');

-- T1: A's, due tomorrow (the one that should be queued). T2: A's, due in two
-- days. T3: B's, due tomorrow but done. T4: nobody's, due tomorrow.
insert into public.project_tasks (id, project_id, title, owner_id, metric, status, due) values
  ('00000000-0000-4000-8000-000000480101', '00000000-0000-4000-8000-000000480001', 'T1',
   '00000000-0000-4000-8000-0000000048a1', 'status', 'doing', (now() at time zone 'Asia/Tokyo')::date + 1),
  ('00000000-0000-4000-8000-000000480102', '00000000-0000-4000-8000-000000480001', 'T2',
   '00000000-0000-4000-8000-0000000048a1', 'status', 'todo', (now() at time zone 'Asia/Tokyo')::date + 2),
  ('00000000-0000-4000-8000-000000480103', '00000000-0000-4000-8000-000000480001', 'T3',
   '00000000-0000-4000-8000-0000000048b2', 'status', 'done', (now() at time zone 'Asia/Tokyo')::date + 1),
  ('00000000-0000-4000-8000-000000480104', '00000000-0000-4000-8000-000000480001', 'T4',
   null, 'status', 'todo', (now() at time zone 'Asia/Tokyo')::date + 1);

do $$
declare
  n integer;
begin
  perform private.queue_task_due_pushes();
  select count(*) into n from public.push_events
  where kind = 'task_due_soon' and task_id::text like '00000000-0000-4000-8000-0000004801%';
  if n <> 1 then raise exception 'FAIL: expected exactly one due-tomorrow push (T1), got %', n; end if;
  if not exists (select 1 from public.push_events
                 where kind = 'task_due_soon' and task_id = '00000000-0000-4000-8000-000000480101'
                   and user_id = '00000000-0000-4000-8000-0000000048a1') then
    raise exception 'FAIL: the push must go to the task''s owner';
  end if;

  -- Running it again the same day adds nothing.
  perform private.queue_task_due_pushes();
  select count(*) into n from public.push_events
  where kind = 'task_due_soon' and task_id::text like '00000000-0000-4000-8000-0000004801%';
  if n <> 1 then raise exception 'FAIL: the same task and due day must be queued once, got %', n; end if;

  -- A finished project's tasks are left alone.
  delete from public.push_events where task_id = '00000000-0000-4000-8000-000000480101';
  update public.projects set status = 'done', finished_at = now() where id = '00000000-0000-4000-8000-000000480001';
  perform private.queue_task_due_pushes();
  if exists (select 1 from public.push_events where task_id = '00000000-0000-4000-8000-000000480101') then
    raise exception 'FAIL: a finished project must not get due-tomorrow pushes';
  end if;
end $$;

-- As A (a student): push_events stays unreadable and the queue can't be run.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000048a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.push_events;
    raise exception 'FAIL: a student must not read push_events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.queue_task_due_pushes();
    raise exception 'FAIL: a student must not run the queue';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
