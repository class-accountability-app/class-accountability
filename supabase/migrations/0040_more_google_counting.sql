-- =============================================================================
-- 0040_more_google_counting.sql — English words and Sheets rows (feature
-- batch 3; the author enabled the Google Sheets API on 2026-11-02)
-- =============================================================================
--
-- Two new kinds of link, both for a counted task (metric 'count'):
--   doc_words — a whole Google Doc, counted in words (whitespace-separated
--               tokens with a letter or digit, like Word's count for English).
--   sheet     — a Google Sheet: the filled rows of its first sheet, less the
--               header row (a Forms responses sheet = the number of answers).
-- 'doc' and 'doc_section' stay characters only; 'slides' stays the slide count.
--
-- A sheet's rows can go down (a deleted row), so source google_sheets may log
-- a negative difference like the other Google sources. Words are logged as
-- google_docs. Counting runs only in the sync-google-progress Edge Function
-- (0026), which must be deployed with the new kinds BEFORE this migration.
-- Only counts are kept, never text or cell values.
--
-- Also: 0038's auto-done now covers every Google source (Slides and Sheets
-- reaching their goal mark the task done too), not just Docs.
-- Test: supabase/tests/rls_google_more_sources.sql.
-- =============================================================================

alter table public.task_sources drop constraint task_sources_kind_check;
alter table public.task_sources add constraint task_sources_kind_check
  check (kind in ('doc', 'doc_section', 'slides', 'doc_words', 'sheet'));

alter table public.project_tasks drop constraint tasks_source_check;
alter table public.project_tasks add constraint tasks_source_check
  check (source in ('manual', 'document', 'google_docs', 'google_slides', 'google_sheets'));

alter table public.task_progress drop constraint task_progress_source_check;
alter table public.task_progress add constraint task_progress_source_check
  check (source in ('manual', 'document', 'google_docs', 'google_slides', 'google_sheets'));

alter table public.task_progress drop constraint task_progress_value_positive;
alter table public.task_progress add constraint task_progress_value_positive
  check (progress_value > 0 or source in ('document', 'google_docs', 'google_slides', 'google_sheets'));

-- The Google source a link kind logs as.
create or replace function private.google_source_for(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind when 'slides' then 'google_slides' when 'sheet' then 'google_sheets' else 'google_docs' end;
$$;
revoke execute on function private.google_source_for(text) from public, anon, authenticated;

-- 0023's guard, with google_sheets.
create or replace function public.keep_task_source()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.source in ('google_docs', 'google_slides', 'google_sheets')
       and (tg_op = 'INSERT' or new.source is distinct from old.source) then
      raise exception 'only linking a file sets a Google source' using errcode = 'SP011';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.task_sources s where s.task_id = new.id)
       and (new.source is distinct from old.source
            or new.metric is distinct from old.metric
            or new.input_mode is distinct from old.input_mode) then
      raise exception 'unlink the file before changing how this task is measured'
        using errcode = 'SP011';
    end if;
  end if;
  return new;
end;
$$;

-- 0023's link, with the two new kinds.
create or replace function public.link_task_source(
  p_task       uuid,
  p_kind       text,
  p_file_id    text,
  p_label      text,
  p_heading_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  task  public.project_tasks;
  total numeric;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into task from project_tasks where id = p_task for update;
  if not found or not public.is_project_member(task.project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  if not exists (select 1 from private.google_credentials c where c.user_id = me) then
    raise exception 'connect Google first' using errcode = 'SP010';
  end if;

  if task.input_mode <> 'manual'
     or (p_kind in ('doc', 'doc_section') and task.metric <> 'characters')
     or (p_kind in ('slides', 'doc_words', 'sheet') and task.metric <> 'count') then
    raise exception 'this file doesn''t fit the task' using errcode = 'SP011';
  end if;

  perform 1 from private.task_source_sync where task_id = p_task for update;

  select coalesce(sum(tp.progress_value), 0) into total
    from task_progress tp where tp.task_id = p_task;

  insert into task_sources (task_id, kind, file_id, heading_id, label, linked_by)
  values (p_task, p_kind, p_file_id, p_heading_id, btrim(p_label), me)
  on conflict (task_id) do update
     set kind       = excluded.kind,
         file_id    = excluded.file_id,
         heading_id = excluded.heading_id,
         label      = excluded.label,
         linked_by  = excluded.linked_by,
         linked_at  = now(),
         state      = 'ok';

  insert into private.task_source_sync (task_id, last_count)
  values (p_task, greatest(round(total), 0)::integer)
  on conflict (task_id) do update
     set last_count      = excluded.last_count,
         last_checked_at = null,
         last_changed_at = null;

  update project_tasks set source = private.google_source_for(p_kind) where id = p_task;
end;
$$;

-- 0023's unlink, with google_sheets.
create or replace function public.unlink_task_source(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  task public.project_tasks;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into task from project_tasks where id = p_task for update;
  if not found or not public.is_project_member(task.project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  delete from private.task_source_sync where task_id = p_task;
  delete from task_sources where task_id = p_task;
  update project_tasks set source = 'manual'
   where id = p_task and source in ('google_docs', 'google_slides', 'google_sheets');
end;
$$;

-- 0023's record, logging each kind under its own source.
create or replace function public.record_synced_count(p_task uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  src   public.task_sources;
  sync  private.task_source_sync;
  owner uuid;
  delta integer;
begin
  if p_count is null or p_count < 0 then
    raise exception 'a count is a whole number, 0 or more' using errcode = '22023';
  end if;

  select * into src from task_sources where task_id = p_task for update;
  if not found then
    return null;
  end if;

  insert into private.task_source_sync (task_id) values (p_task) on conflict (task_id) do nothing;
  select * into sync from private.task_source_sync where task_id = p_task for update;

  delta := p_count - sync.last_count;
  select t.owner_id into owner from project_tasks t where t.id = p_task;

  if delta <> 0 and owner is not null then
    insert into task_progress (task_id, user_id, progress_value, source)
    values (p_task, owner, delta, private.google_source_for(src.kind));
  end if;

  update private.task_source_sync
     set last_count      = p_count,
         last_checked_at = now(),
         last_changed_at = case when delta <> 0 then now() else last_changed_at end
   where task_id = p_task;

  if src.state <> 'ok' then
    update task_sources set state = 'ok' where task_id = p_task;
  end if;

  return case when owner is null then 0 else delta end;
end;
$$;

-- 0038's auto-done, for every Google source.
create or replace function private.auto_done_from_google()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.project_tasks;
  total numeric;
begin
  if new.source not in ('google_docs', 'google_slides', 'google_sheets') then
    return new;
  end if;
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
