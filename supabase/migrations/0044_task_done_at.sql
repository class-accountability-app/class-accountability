-- =============================================================================
-- 0044_task_done_at.sql — when a task was finished (for 前回から変わったこと)
-- =============================================================================
-- The board's "what changed since you last opened" list (2026-11-13) shows
-- things a teammate can already see on the board: a task added, a task
-- finished, a check-in shared, a meeting poll opened, a team link pinned.
-- Every one of those has a time except "finished": project_tasks only knew
-- its status. done_at is that time.
--
-- The database keeps it, never the browser: a trigger stamps now() when a
-- task's status becomes 'done', clears it when the task is reopened, and
-- otherwise puts back the stored value, so a client can't backdate or forge
-- it. Tasks already done before this migration keep done_at null (their time
-- isn't known), so they never show up as news.
--
-- No policy or grant changes: done_at is read with the task, by the team.
-- =============================================================================

alter table public.project_tasks add column done_at timestamptz;

create or replace function public.stamp_task_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.done_at := case when new.status = 'done' then now() else null end;
  elsif new.status is distinct from old.status then
    new.done_at := case when new.status = 'done' then now() else null end;
  else
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.stamp_task_done() from public, anon, authenticated;

create trigger project_tasks_stamp_done
  before insert or update on public.project_tasks
  for each row execute function public.stamp_task_done();
