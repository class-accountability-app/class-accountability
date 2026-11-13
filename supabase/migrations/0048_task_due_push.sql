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

-- 09:25 JST, after the other morning queues (09:00–09:20).
select cron.schedule('queue-task-due-pushes', '25 0 * * *',
  $$select private.queue_task_due_pushes(); select private.send_push_events();$$);
