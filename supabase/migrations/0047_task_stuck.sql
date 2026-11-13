-- 0047: 「困っています」 on a task (the author's choice of 2026-11-13: a stuck
-- flag with a one-line note the team can read).
--
-- project_tasks.stuck_note is null (not stuck) or 1–80 characters saying what
-- the owner is stuck on; stuck_at is when it was raised. The team reads both
-- with the task (no policy change). The database keeps the rules, so a
-- teammate can't speak for the owner:
--   * only the task's current owner sets, changes or clears the note;
--   * a new task is never stuck;
--   * finishing the task or changing its owner (hand over, leaving the team)
--     clears it;
--   * stuck_at is the server's clock, never the browser's.
-- The teacher's board (0046) does not include it.
-- Test: supabase/tests/rls_task_stuck.sql.

alter table public.project_tasks
  add column stuck_note text,
  add column stuck_at timestamptz,
  add constraint project_tasks_stuck_note check (
    stuck_note is null
    or (char_length(btrim(stuck_note)) between 1 and 80 and stuck_note !~ '[[:cntrl:]]')
  );

create or replace function public.keep_task_stuck()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.stuck_note := null;
    new.stuck_at := null;
    return new;
  end if;

  if new.status = 'done' or new.owner_id is distinct from old.owner_id then
    new.stuck_note := null;
  elsif new.stuck_note is distinct from old.stuck_note
        and current_user in ('authenticated', 'anon')
        and (old.owner_id is null or old.owner_id is distinct from auth.uid()) then
    raise exception 'only the task''s owner says it is stuck' using errcode = '42501';
  end if;

  new.stuck_at := case
    when new.stuck_note is null then null
    when old.stuck_note is null then now()
    else old.stuck_at
  end;
  return new;
end;
$$;

revoke execute on function public.keep_task_stuck() from public, anon, authenticated;

create trigger project_tasks_keep_stuck
  before insert or update on public.project_tasks
  for each row execute function public.keep_task_stuck();
