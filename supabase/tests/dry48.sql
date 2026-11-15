-- =============================================================================
-- dry48.sql — dry run of 0048 (due-tomorrow push) with its test
-- =============================================================================
-- Paste this whole file into the Supabase dashboard's SQL editor and run it.
-- It is ONE transaction that ends in ROLLBACK: nothing is kept. Success is the
-- final row: result = 'dry run passed'. A failure shows 'FAIL: ...' instead.
-- The cron.schedule line of 0048 is left out here on purpose (it only names
-- the job); everything else is the migration as written, then
-- rls_task_due_push.sql.
-- =============================================================================

begin;

-- 0048: a push the day before a task is due (the author's choice of
-- 2026-11-13: to the task's owner only, once per task, outside quiet hours).
--
-- push_events.kind 'task_due_soon' (+ task_id). pg_cron
-- 'queue-task-due-pushes' (00:25 UTC = 09:25 JST, after the other morning
-- queues) adds one row for each task that is due TOMORROW (Tokyo), not done,
-- has an owner, and belongs to an active project. ref_key holds the task and
-- its due day, so a task is pushed once per due date: moving the date later
-- earns one new reminder, nothing else repeats it. send-nudge-push re-checks
-- before sending (still theirs, not done, still due within a day) and names
-- the task, which only its owner receives. Nobody else is told.
-- Deploy send-nudge-push before applying this migration.
-- Test: supabase/tests/rls_task_due_push.sql.

alter table public.push_events drop constraint push_events_kind_check;
alter table public.push_events add constraint push_events_kind_check
  check (kind in ('meeting_reminder', 'task_stalled', 'checkin_due', 'poll_vote_due', 'announcement',
                  'weekly_digest', 'team_inactive', 'task_due_soon'));

alter table public.push_events drop constraint push_events_ref_check;
alter table public.push_events add constraint push_events_ref_check check (
  (kind in ('meeting_reminder', 'poll_vote_due') and poll_id is not null and task_id is null and project_id is null and announcement_id is null and class_id is null)
  or (kind in ('task_stalled', 'task_due_soon') and task_id is not null and poll_id is null and project_id is null and announcement_id is null and class_id is null)
  or (kind in ('checkin_due', 'weekly_digest') and project_id is not null and poll_id is null and task_id is null and announcement_id is null and class_id is null)
  or (kind = 'announcement' and announcement_id is not null and poll_id is null and task_id is null and project_id is null and class_id is null)
  or (kind = 'team_inactive' and class_id is not null and poll_id is null and task_id is null and project_id is null and announcement_id is null)
);

create or replace function private.queue_task_due_pushes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tomorrow date := (now() at time zone 'Asia/Tokyo')::date + 1;
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, task_id)
  select t.owner_id, 'task_due_soon', t.id::text || '@' || t.due::text, t.id
  from public.project_tasks t
  join public.projects pr on pr.id = t.project_id
  where t.due = tomorrow
    and t.status <> 'done'
    and t.owner_id is not null
    and pr.status = 'active'
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.queue_task_due_pushes() from public, anon, authenticated;


-- ---- test (supabase/tests/rls_task_due_push.sql) ----
-- =============================================================================
-- rls_task_due_push.sql — tests for 0048 (a push the day before a task is due)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
-- It calls the queue function only, never send_push_events(), so nothing is
-- sent. Cast (all @andrew.ac.jp): A, B teammates in team F with project J.
-- =============================================================================


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
   '00000000-0000-4000-8000-0000000048a1'),
  ('00000000-0000-4000-8000-000000480002', '00000000-0000-4000-8000-0000000048f1', 'J finished',
   '00000000-0000-4000-8000-0000000048a1');

-- T1: A's, due tomorrow (the one that should be queued). T2: A's, due in two
-- days. T3: B's, due tomorrow but done. T4: nobody's, due tomorrow. T5: B's,
-- due tomorrow, in a project that is finished.
insert into public.project_tasks (id, project_id, title, owner_id, metric, status, due) values
  ('00000000-0000-4000-8000-000000480101', '00000000-0000-4000-8000-000000480001', 'T1',
   '00000000-0000-4000-8000-0000000048a1', 'status', 'doing', (now() at time zone 'Asia/Tokyo')::date + 1),
  ('00000000-0000-4000-8000-000000480102', '00000000-0000-4000-8000-000000480001', 'T2',
   '00000000-0000-4000-8000-0000000048a1', 'status', 'todo', (now() at time zone 'Asia/Tokyo')::date + 2),
  ('00000000-0000-4000-8000-000000480103', '00000000-0000-4000-8000-000000480001', 'T3',
   '00000000-0000-4000-8000-0000000048b2', 'status', 'done', (now() at time zone 'Asia/Tokyo')::date + 1),
  ('00000000-0000-4000-8000-000000480104', '00000000-0000-4000-8000-000000480001', 'T4',
   null, 'status', 'todo', (now() at time zone 'Asia/Tokyo')::date + 1),
  ('00000000-0000-4000-8000-000000480105', '00000000-0000-4000-8000-000000480002', 'T5',
   '00000000-0000-4000-8000-0000000048b2', 'status', 'doing', (now() at time zone 'Asia/Tokyo')::date + 1);
update public.projects set status = 'done', finished_at = now() where id = '00000000-0000-4000-8000-000000480002';

do $$
declare
  n integer;
begin
  perform private.queue_task_due_pushes();
  select count(*) into n from public.push_events
  where kind = 'task_due_soon' and task_id::text like '00000000-0000-4000-8000-0000004801%';
  if n <> 1 then raise exception 'FAIL: expected exactly one due-tomorrow push (T1; not the done, unowned or finished-project ones), got %', n; end if;
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

select 'dry run passed' as result;
