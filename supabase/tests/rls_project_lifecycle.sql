-- =============================================================================
-- rls_project_lifecycle.sql — tests for 0033 (finish a project, start the
-- next, check-in day reminders)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, pod F1 with project P1 (A owns a counted task)
--   C    — class K, alone in pod F2 (outsider to F1)
--   O    — organizer of K
-- Project R (pod F2) has a round ending today, for the reminder queue.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000033a1', 'rls-test-la@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000033b2', 'rls-test-lb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000033c3', 'rls-test-lc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000033e5', 'rls-test-lo@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000033c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000033e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000033a1', '00000000-0000-4000-8000-00000033c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000033b2', '00000000-0000-4000-8000-00000033c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000033c3', '00000000-0000-4000-8000-00000033c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000033e5', '00000000-0000-4000-8000-00000033c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000033f1', '00000000-0000-4000-8000-00000033c1a5'),
  ('00000000-0000-4000-8000-0000000033f2', '00000000-0000-4000-8000-00000033c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000033f1', '00000000-0000-4000-8000-0000000033a1'),
  ('00000000-0000-4000-8000-0000000033f1', '00000000-0000-4000-8000-0000000033b2'),
  ('00000000-0000-4000-8000-0000000033f2', '00000000-0000-4000-8000-0000000033c3');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000330001', '00000000-0000-4000-8000-0000000033f1', 'P1',
   '00000000-0000-4000-8000-0000000033a1');

-- R: every 4 days, started 3 days ago (Tokyo), so today is the round's last day.
insert into public.projects (id, pairing_id, title, created_by, start_date, checkin_every_days) values
  ('00000000-0000-4000-8000-000000330002', '00000000-0000-4000-8000-0000000033f2', 'R',
   '00000000-0000-4000-8000-0000000033c3', (now() at time zone 'Asia/Tokyo')::date - 3, 4);

insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount, status) values
  ('00000000-0000-4000-8000-000000330101', '00000000-0000-4000-8000-000000330001', 'Slides',
   '00000000-0000-4000-8000-0000000033a1', 'count', 'slides', 10, 'doing');

-- =============================================================================
-- As C (another pod): can't finish P1. A client can't flip status directly.
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000033c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.finish_project('00000000-0000-4000-8000-000000330001');
    raise exception 'FAIL: a non-member must not finish another team''s project';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000033a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.projects set status = 'done', finished_at = now()
    where id = '00000000-0000-4000-8000-000000330001';
    raise exception 'FAIL: a client must not change status directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- =============================================================================
-- As A: log, then a second active project is refused; finish P1
-- =============================================================================
do $$
begin
  insert into public.task_progress (task_id, user_id, progress_value)
  values ('00000000-0000-4000-8000-000000330101', '00000000-0000-4000-8000-0000000033a1', 4);

  begin
    insert into public.projects (pairing_id, title, created_by)
    values ('00000000-0000-4000-8000-0000000033f1', 'P2 too early', '00000000-0000-4000-8000-0000000033a1');
    raise exception 'FAIL: a team must not have two active projects';
  exception when unique_violation then null;
  end;

  perform public.finish_project('00000000-0000-4000-8000-000000330001');
  if not exists (select 1 from public.projects
                 where id = '00000000-0000-4000-8000-000000330001' and status = 'done' and finished_at is not null) then
    raise exception 'FAIL: finish_project should mark the project done';
  end if;
end $$;

-- =============================================================================
-- The finished project is read-only (SP016), still readable; a new one starts
-- =============================================================================
do $$
declare
  n numeric;
begin
  begin
    insert into public.task_progress (task_id, user_id, progress_value)
    values ('00000000-0000-4000-8000-000000330101', '00000000-0000-4000-8000-0000000033a1', 1);
    raise exception 'FAIL: logging on a finished project must be refused';
  exception when sqlstate 'SP016' then null;
  end;
  begin
    update public.project_tasks set status = 'done' where id = '00000000-0000-4000-8000-000000330101';
    raise exception 'FAIL: editing a task of a finished project must be refused';
  exception when sqlstate 'SP016' then null;
  end;
  begin
    insert into public.project_tasks (project_id, title, metric)
    values ('00000000-0000-4000-8000-000000330001', 'late', 'status');
    raise exception 'FAIL: adding a task to a finished project must be refused';
  exception when sqlstate 'SP016' then null;
  end;
  begin
    perform public.submit_checkin('00000000-0000-4000-8000-000000330001', null);
    raise exception 'FAIL: checking in on a finished project must be refused';
  exception when sqlstate 'SP016' then null;
  end;
  begin
    perform public.create_meeting_poll('00000000-0000-4000-8000-000000330001', 'M', 30, null,
      array[now() + interval '2 days', now() + interval '3 days']);
    raise exception 'FAIL: a meeting poll on a finished project must be refused';
  exception when sqlstate 'SP016' then null;
  end;

  select total into n from public.project_task_totals('00000000-0000-4000-8000-000000330001')
  where task_id = '00000000-0000-4000-8000-000000330101';
  if n is distinct from 4 then raise exception 'FAIL: a finished project should keep its totals, got %', n; end if;

  insert into public.projects (pairing_id, title, created_by)
  values ('00000000-0000-4000-8000-0000000033f1', 'P2', '00000000-0000-4000-8000-0000000033a1');
end $$;

-- =============================================================================
-- Leaving the team still unassigns tasks of the finished project
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000033a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.leave_pod('00000000-0000-4000-8000-0000000033f1');
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.project_tasks
             where id = '00000000-0000-4000-8000-000000330101' and owner_id is not null) then
    raise exception 'FAIL: leaving should unassign the leaver''s tasks, finished project or not';
  end if;
end $$;

-- =============================================================================
-- As O: the summary counts the active project only (P2, no tasks)
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000033e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.class_team_summary('00000000-0000-4000-8000-00000033c1a5') where team_no = 1;
  if not r.has_project or r.task_count <> 0 then
    raise exception 'FAIL: the summary should show the active project P2, not the finished P1: %', r;
  end if;
end $$;

-- =============================================================================
-- Check-in day reminder: C is due on R today; not once C has checked in;
-- never for a finished project's members
-- =============================================================================
reset role;
do $$
declare
  n integer;
begin
  n := private.queue_checkin_reminders();
  if not exists (select 1 from public.push_events
                 where user_id = '00000000-0000-4000-8000-0000000033c3' and kind = 'checkin_due'
                   and project_id = '00000000-0000-4000-8000-000000330002') then
    raise exception 'FAIL: C should get a check-in day reminder for R';
  end if;
  if exists (select 1 from public.push_events
             where kind = 'checkin_due' and project_id = '00000000-0000-4000-8000-000000330001') then
    raise exception 'FAIL: a finished project must not queue reminders';
  end if;
  -- Running it again queues nothing new.
  if private.queue_checkin_reminders() <> 0 then
    raise exception 'FAIL: the reminder must be queued once per round';
  end if;
  delete from public.push_events where kind = 'checkin_due';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000033c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.submit_checkin('00000000-0000-4000-8000-000000330002', null);
end $$;
reset role;
do $$
begin
  perform private.queue_checkin_reminders();
  if exists (select 1 from public.push_events where kind = 'checkin_due'
             and user_id = '00000000-0000-4000-8000-0000000033c3') then
    raise exception 'FAIL: no reminder for someone who already checked in this round';
  end if;
end $$;

-- =============================================================================
-- Logged out
-- =============================================================================
set local role anon;
do $$
begin
  perform public.finish_project('00000000-0000-4000-8000-000000330002');
  raise exception 'FAIL: anon must not run finish_project';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
