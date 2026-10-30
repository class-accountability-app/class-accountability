-- =============================================================================
-- 0030_task_documents.sql — 「Study Pods で書く」 on project tasks.
-- =============================================================================
-- The in-app editor (0019, Prompt 12) moves from personal targets to project
-- tasks, before the old target tables are dropped. Same rules as 0019:
--
-- 1. project_tasks.input_mode 'document' (the column exists since 0022): a
--    characters task written in the app. A task with progress already logged
--    can't become a document, and a document with text can't go back (SP006).
--    A document task can't get ＋記録 entries (SP007); it is logged by its
--    editor.
-- 2. task_documents (one per document task) and task_document_versions
--    (history, newest 50) are readable only by their writer: no teammate,
--    organizer or logged-out access. The writer is whoever owned the task
--    when the text was first saved; if the task changes hands, the new owner
--    can't read or overwrite it (they see "this text is someone else's").
--    At most 100,000 characters and 1,000,000 bytes of JSON (SP005).
-- 3. save_task_document logs (new count − what the editor logged so far)
--    into the current writing session's task_progress row (source
--    'document'; a new row after 30 minutes or on a new Tokyo day; can be
--    negative). Teammates see the count through project_task_totals (0027),
--    never the text.
--
-- Tests: supabase/tests/rls_task_documents.sql.
-- =============================================================================


-- 1. DOCUMENTS AND VERSIONS ---------------------------------------------------

create table public.task_documents (
  task_id     uuid primary key references public.project_tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content     jsonb not null,
  char_count  integer not null default 0 check (char_count between 0 and 100000),
  version     integer not null default 0 check (version >= 0),
  updated_at  timestamptz not null default now(),
  constraint task_documents_task_user_key unique (task_id, user_id),
  constraint task_documents_content_size check (octet_length(content::text) <= 1000000)
);

alter table public.task_documents enable row level security;
create index task_documents_user_idx on public.task_documents (user_id);

create table public.task_document_versions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null,
  user_id     uuid not null,
  content     jsonb not null,
  char_count  integer not null check (char_count between 0 and 100000),
  reason      text not null check (reason in ('autosave', 'before_restore', 'conflict')),
  created_at  timestamptz not null default now(),
  constraint task_document_versions_document_fk foreign key (task_id, user_id)
    references public.task_documents (task_id, user_id) on delete cascade,
  constraint task_document_versions_content_size check (octet_length(content::text) <= 1000000)
);

alter table public.task_document_versions enable row level security;
create index task_document_versions_task_created_idx
  on public.task_document_versions (task_id, created_at desc);

create policy "read own task document" on public.task_documents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "read own task document versions" on public.task_document_versions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.task_documents, public.task_document_versions from public, anon, authenticated;
grant select on public.task_documents, public.task_document_versions to authenticated;


-- 2. A TASK'S MODE ------------------------------------------------------------

create or replace function public.keep_task_input_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.input_mode is not distinct from old.input_mode then
    return new;
  end if;
  if new.input_mode = 'document' and exists (select 1 from task_progress where task_id = new.id) then
    raise exception 'a task with progress can''t become a document' using errcode = 'SP006';
  end if;
  if old.input_mode = 'document' and exists (select 1 from task_documents where task_id = new.id and char_count > 0) then
    raise exception 'a document with text can''t go back' using errcode = 'SP006';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_task_input_mode() from public, anon, authenticated;

create trigger project_tasks_keep_input_mode
  before update on public.project_tasks
  for each row execute function public.keep_task_input_mode();

-- ＋記録 on a document task: refused. Only the app's roles are checked;
-- save_task_document (security definer) writes the 'document' rows.
create or replace function public.guard_task_document_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and exists (select 1 from project_tasks where id = new.task_id and input_mode = 'document') then
    raise exception 'a document task is logged by its editor' using errcode = 'SP007';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_task_document_progress() from public, anon, authenticated;

create trigger task_progress_guard_document
  before insert on public.task_progress
  for each row execute function public.guard_task_document_progress();


-- 3. SAVING -------------------------------------------------------------------

create or replace function public.save_task_document(
  p_task uuid,
  p_expected_version integer,
  p_content jsonb,
  p_char_count integer,
  p_keep_current text default null   -- 'before_restore' | 'conflict'
)
returns table (status text, version integer, char_count integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  me constant uuid := auth.uid();
  doc task_documents%rowtype;
  logged numeric;
  delta numeric;
  session_id uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_char_count is null or p_char_count < 0 or p_char_count > 100000
     or p_content is null or octet_length(p_content::text) > 1000000 then
    raise exception 'document too long' using errcode = 'SP005';
  end if;
  if p_keep_current is not null and p_keep_current not in ('before_restore', 'conflict') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;

  -- A document task I own. The row lock makes saves run one at a time.
  perform 1 from project_tasks t
  where t.id = p_task and t.owner_id = me and t.input_mode = 'document'
  for update;
  if not found then
    raise exception 'not a document task of yours' using errcode = '42501';
  end if;

  select * into doc from task_documents d where d.task_id = p_task;
  if not found then
    insert into task_documents (task_id, user_id, content)
    values (p_task, me, '{"type":"doc","content":[]}'::jsonb)
    returning * into doc;
  elsif doc.user_id <> me then
    raise exception 'this text is someone else''s' using errcode = '42501';
  end if;

  if doc.version <> p_expected_version then
    return query select 'conflict'::text, doc.version, doc.char_count, doc.updated_at;
    return;
  end if;

  if p_keep_current is not null then
    insert into task_document_versions (task_id, user_id, content, char_count, reason)
    values (p_task, me, doc.content, doc.char_count, p_keep_current);
  end if;

  update task_documents d
  set content = p_content, char_count = p_char_count, version = d.version + 1, updated_at = now()
  where d.task_id = p_task
  returning * into doc;

  if not exists (
    select 1 from task_document_versions v
    where v.task_id = p_task and v.reason = 'autosave' and v.created_at > now() - interval '10 minutes'
  ) then
    insert into task_document_versions (task_id, user_id, content, char_count, reason)
    values (p_task, me, p_content, p_char_count, 'autosave');
  end if;

  delete from task_document_versions v
  where v.task_id = p_task
    and v.id not in (
      select v2.id from task_document_versions v2
      where v2.task_id = p_task order by v2.created_at desc limit 50
    );

  select coalesce(sum(l.progress_value), 0) into logged
  from task_progress l where l.task_id = p_task and l.source = 'document';
  delta := p_char_count - logged;

  if delta <> 0 then
    select l.id into session_id
    from task_progress l
    where l.task_id = p_task and l.source = 'document' and l.user_id = me
      and l.logged_at > now() - interval '30 minutes'
      and (l.logged_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date
    order by l.logged_at desc
    limit 1;

    if session_id is not null then
      update task_progress l set progress_value = l.progress_value + delta where l.id = session_id;
    else
      insert into task_progress (task_id, user_id, source, progress_value)
      values (p_task, me, 'document', delta);
    end if;
  end if;

  return query select 'saved'::text, doc.version, doc.char_count, doc.updated_at;
end;
$$;

revoke execute on function public.save_task_document(uuid, integer, jsonb, integer, text) from public, anon;
grant execute on function public.save_task_document(uuid, integer, jsonb, integer, text) to authenticated;

create or replace function public.keep_task_document_version(
  p_task uuid,
  p_content jsonb,
  p_char_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_char_count is null or p_char_count < 0 or p_char_count > 100000
     or p_content is null or octet_length(p_content::text) > 1000000 then
    raise exception 'document too long' using errcode = 'SP005';
  end if;

  perform 1 from task_documents d where d.task_id = p_task and d.user_id = me for update;
  if not found then
    raise exception 'not a document of yours' using errcode = '42501';
  end if;

  insert into task_document_versions (task_id, user_id, content, char_count, reason)
  values (p_task, me, p_content, p_char_count, 'conflict');

  delete from task_document_versions v
  where v.task_id = p_task
    and v.id not in (
      select v2.id from task_document_versions v2
      where v2.task_id = p_task order by v2.created_at desc limit 50
    );
end;
$$;

revoke execute on function public.keep_task_document_version(uuid, jsonb, integer) from public, anon;
grant execute on function public.keep_task_document_version(uuid, jsonb, integer) to authenticated;
