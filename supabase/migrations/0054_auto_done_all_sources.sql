-- =============================================================================
-- 0054_auto_done_all_sources.sql — a task is done as soon as its target is
-- reached, however the progress was logged (the author's ask of 2026-11-27)
-- =============================================================================
--
-- 0038 (and 0040) set a counted task with a goal to 'done' when a Google sync
-- brought it to its goal. ＋記録 by hand and 「Study Pods で書く」 didn't, so a
-- student had to mark the task done themselves. Now every task_progress entry
-- (source manual, document or google_*) checks: when the task's total reaches
-- its target_amount, the task becomes 'done'.
--
-- Unchanged: status-only tasks and tasks without a target are never touched;
-- a task already done stays as it is; done is never undone automatically
-- (deleting text later doesn't reopen it; the owner can reopen it by hand);
-- done_at (0044) is stamped and a 「困っています」 note (0047) cleared by their
-- own triggers, as for any change to done. A finished project refuses the
-- entry itself (0033), so nothing reaches this trigger there. Any error only
-- warns, so logging never fails because of it.
--
-- The trigger keeps its name; its function is replaced by one with an
-- accurate name, and the Google-only one is dropped.
-- Test: supabase/tests/rls_auto_done.sql.
-- =============================================================================

create or replace function private.auto_done_on_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.project_tasks;
  total numeric;
begin
  select * into task from public.project_tasks where id = new.task_id;
  if task.id is null or task.status = 'done' or task.metric = 'status' or task.target_amount is null then
    return new;
  end if;
  select coalesce(sum(progress_value), 0) into total from public.task_progress where task_id = new.task_id;
  if total >= task.target_amount then
    update public.project_tasks set status = 'done' where id = task.id;
  end if;
  return new;
exception when others then
  raise warning 'auto-done skipped (%)', sqlstate;
  return new;
end;
$$;

revoke execute on function private.auto_done_on_target() from public, anon, authenticated;

drop trigger task_progress_auto_done on public.task_progress;
create trigger task_progress_auto_done
  after insert on public.task_progress
  for each row execute function private.auto_done_on_target();

drop function private.auto_done_from_google();
