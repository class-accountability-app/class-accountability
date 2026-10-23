-- =============================================================================
-- 0023_google_sources.sql — tasks counted from a linked Google Doc or Slides file
-- =============================================================================
-- A student connects Google once (OAuth, scope drive.file). A task can then be
-- linked to a Google Doc (the whole file, or one heading's section of a shared
-- group Doc: characters) or a Slides file (slide count). Every 5 minutes an
-- Edge Function reads each linked file with the linker's token, counts it, and
-- calls record_synced_count(), which logs the difference as task_progress. The
-- OAuth flow, the Edge Function and the UI are later PRs; this is the database.
--
-- DOCUMENT TEXT NEVER REACHES THE DATABASE. Only counts, Google's file and
-- heading ids, and a label the student types.
--
-- 1. private.google_credentials: one row per student, the refresh token as
--    AES-GCM ciphertext made by the app with the server key GOOGLE_TOKEN_KEY
--    (the database never sees the plaintext). The private schema isn't exposed
--    and nobody has a privilege on the table, service_role included: rows are
--    written and read only by save_google_credentials() and
--    get_google_credentials() (service_role only), and deleted by
--    delete_my_google_credentials() (the student, own row) or with the account
--    (on delete cascade from profiles). has_google_connection() tells a
--    student whether they are connected, nothing more.
--
-- 2. public.task_sources: at most one link per task, with NO numbers and NO
--    activity times (0022: a teammate sees another member's numbers only
--    through check-ins). Any pod member reads it. No client writes:
--    link_task_source() / unlink_task_source() for any pod member (as "any
--    member edits tasks"; organizers are never members), and
--    mark_task_source_lost() for the Edge Function.
--
-- 3. private.task_source_sync: the sync's own state per linked task
--    (last_count, last_checked_at, last_changed_at). No client privilege; the
--    task's current owner reads theirs through my_task_sync_status(), which
--    returns nothing to anyone else. Written by link_task_source() and
--    record_synced_count().
--
-- 4. Counting. A link sets last_count to the task's current total, so the first
--    sync logs (file count − total) and from then on the task's total IS the
--    file's count: no double counting after unlink + relink, a switch to
--    another file, or manual entries made before linking. While a task is
--    linked its owner can't ＋記録 on it (can_log_task, redefined below), and its
--    metric, input mode and source stay as they are. Synced rows are logged in
--    the current owner's name with source google_docs / google_slides and may
--    be negative (text or slides deleted), like the editor's 'document' rows;
--    0022's task_progress policy shows them to that owner only.
--    With no owner the row is skipped but last_* still move (the brief's rule):
--    changes made while a task has no owner aren't counted until it is relinked.
--
-- 5. Whose token is used: linked_by's. Linking needs a connected Google account
--    (SP010). Disconnecting Google marks the student's links lost_access (they
--    come back by themselves if the student reconnects). Leaving the pod (or
--    deleting the account) clears linked_by on that pod's links and marks them
--    lost_access, so the app never reads a group's file with the token of
--    someone who left; a member relinks.
--
-- ERROR CODES (next free after SP009)
--   SP010  connect Google before linking a file
--   SP011  this file doesn't fit the task (Doc/section needs a characters task,
--          Slides a count task; not a task written in Study Pods), or a linked
--          task's metric, input mode or source was changed
--
-- Every table has RLS enabled in this file (rule 1).
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

create table private.google_credentials (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  refresh_token_enc  text not null,
  google_sub         text,
  connected_at       timestamptz not null default now(),
  constraint google_credentials_token_length check (char_length(refresh_token_enc) between 1 and 4096),
  constraint google_credentials_sub_length check (google_sub is null or char_length(google_sub) between 1 and 255)
);
alter table private.google_credentials enable row level security;

create table public.task_sources (
  task_id     uuid primary key references public.project_tasks(id) on delete cascade,
  kind        text not null,
  file_id     text not null,
  heading_id  text,
  label       text not null,
  linked_by   uuid references public.profiles(id) on delete set null,
  linked_at   timestamptz not null default now(),
  state       text not null default 'ok',
  constraint task_sources_kind_check check (kind in ('doc', 'doc_section', 'slides')),
  -- Google's ids are URL-safe; checking the shape keeps anything else out.
  constraint task_sources_file_id_shape check (file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  constraint task_sources_heading_id_shape check (heading_id is null or heading_id ~ '^[A-Za-z0-9._-]{1,100}$'),
  constraint task_sources_heading_for_section check ((kind = 'doc_section') = (heading_id is not null)),
  constraint task_sources_label_length check (
    char_length(btrim(label)) between 1 and 60 and label !~ '[[:cntrl:]]'
  ),
  constraint task_sources_state_check check (state in ('ok', 'lost_access'))
);
alter table public.task_sources enable row level security;
create index task_sources_linked_by_idx on public.task_sources (linked_by);

create table private.task_source_sync (
  task_id          uuid primary key references public.project_tasks(id) on delete cascade,
  last_count       integer not null default 0,
  last_checked_at  timestamptz,
  last_changed_at  timestamptz,
  constraint task_source_sync_count_not_negative check (last_count >= 0)
);
alter table private.task_source_sync enable row level security;


-- =============================================================================
-- 2. 0022's CHECKS: the Slides source, and negative synced differences
-- =============================================================================

alter table public.project_tasks drop constraint tasks_source_check;
alter table public.project_tasks add constraint tasks_source_check
  check (source in ('manual', 'document', 'google_docs', 'google_slides'));

alter table public.task_progress drop constraint task_progress_source_check;
alter table public.task_progress add constraint task_progress_source_check
  check (source in ('manual', 'document', 'google_docs', 'google_slides'));

-- The editor and the Google sync log a negative difference (a shorter file).
alter table public.task_progress drop constraint task_progress_value_positive;
alter table public.task_progress add constraint task_progress_value_positive
  check (progress_value > 0 or source in ('document', 'google_docs', 'google_slides'));


-- =============================================================================
-- 3. POLICY and the ＋記録 rule
-- =============================================================================

-- Any member of the task's pod reads the link (no numbers in it).
create policy "read my pod's task sources"
  on public.task_sources for select to authenticated
  using (
    exists (
      select 1 from public.project_tasks t
      where t.id = task_sources.task_id
        and public.is_project_member(t.project_id)
    )
  );

-- As 0022, plus: not while the task is linked to a Google file (the file is
-- the count; a manual entry would be counted twice).
create or replace function public.can_log_task(target_task uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from project_tasks t
    where t.id = target_task
      and t.owner_id = auth.uid()
      and t.metric <> 'status'
      and t.input_mode = 'manual'
      and not exists (select 1 from task_sources s where s.task_id = t.id)
  );
$$;


-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- Only link/unlink set a task's source to or from Google, and a linked task
-- keeps the metric and input mode its file is counted in. link/unlink are
-- security definer and so run as their owner, which passes the current_user
-- test (as 0022's clock); this trigger must NOT be security definer, or
-- current_user would always be its owner.
create or replace function public.keep_task_source()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.source in ('google_docs', 'google_slides')
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

create trigger project_tasks_keep_source
  before insert or update on public.project_tasks
  for each row execute function public.keep_task_source();

-- Someone who leaves a pod (or whose account goes) stops lending their Google
-- token to its links: linked_by clears and the link waits for a relink.
create or replace function public.release_sources_of_leaver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update task_sources s
     set linked_by = null,
         state = 'lost_access'
    from project_tasks t
    join projects pr on pr.id = t.project_id
   where s.task_id = t.id
     and pr.pairing_id = old.pairing_id
     and s.linked_by = old.user_id;
  return old;
end;
$$;

create trigger pairing_members_release_sources
  after delete on public.pairing_members
  for each row execute function public.release_sources_of_leaver();


-- =============================================================================
-- 5. STUDENT FUNCTIONS (authenticated)
-- =============================================================================

-- Link (or relink) a task to a Google file. Any member of the task's pod, with
-- Google connected. Sets the task's source and starts last_count at the
-- task's current total (see the header, point 4).
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

  -- Locks the task: a link and a ＋記録 on it can't interleave.
  select * into task from project_tasks where id = p_task for update;
  if not found or not public.is_project_member(task.project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  if not exists (select 1 from private.google_credentials c where c.user_id = me) then
    raise exception 'connect Google first' using errcode = 'SP010';
  end if;

  if task.input_mode <> 'manual'
     or (p_kind in ('doc', 'doc_section') and task.metric <> 'characters')
     or (p_kind = 'slides' and task.metric <> 'count') then
    raise exception 'this file doesn''t fit the task' using errcode = 'SP011';
  end if;

  -- Waits for a sync of this task that is running now.
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

  update project_tasks
     set source = case when p_kind = 'slides' then 'google_slides' else 'google_docs' end
   where id = p_task;
end;
$$;

-- Unlink: the task goes back to manual entries; its numbers so far stay.
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
   where id = p_task and source in ('google_docs', 'google_slides');
end;
$$;

-- The sync state of MY task: only its current owner gets a row (a teammate
-- sees numbers only through check-ins), and only while it is linked.
create or replace function public.my_task_sync_status(p_task uuid)
returns table (last_checked_at timestamptz, last_count integer)
language sql
security definer
set search_path = public
stable
as $$
  select s.last_checked_at, s.last_count
  from private.task_source_sync s
  join project_tasks t on t.id = s.task_id
  where s.task_id = p_task
    and t.owner_id = auth.uid()
    and exists (select 1 from task_sources ts where ts.task_id = s.task_id);
$$;

-- Am I connected to Google? (Never the token.)
create or replace function public.has_google_connection()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from private.google_credentials c where c.user_id = auth.uid()
  );
$$;

-- Disconnect Google: my token is gone and the links I made can't be read.
-- (Reconnecting makes them readable again; the next sync sets them 'ok'.)
create or replace function public.delete_my_google_credentials()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  delete from private.google_credentials where user_id = me;
  update task_sources set state = 'lost_access' where linked_by = me;
end;
$$;


-- =============================================================================
-- 6. SERVER FUNCTIONS (service_role only: the OAuth callback and the Edge
--    Function, with the service_role key, which never leaves the server)
-- =============================================================================

-- After the OAuth callback: store (or replace) a student's encrypted token.
create or replace function public.save_google_credentials(
  p_user              uuid,
  p_refresh_token_enc text,
  p_google_sub        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into private.google_credentials (user_id, refresh_token_enc, google_sub)
  values (p_user, p_refresh_token_enc, p_google_sub)
  on conflict (user_id) do update
     set refresh_token_enc = excluded.refresh_token_enc,
         google_sub        = excluded.google_sub,
         connected_at      = now();
end;
$$;

-- The Edge Function decrypts this with GOOGLE_TOKEN_KEY.
create or replace function public.get_google_credentials(p_user uuid)
returns table (refresh_token_enc text, google_sub text, connected_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select c.refresh_token_enc, c.google_sub, c.connected_at
  from private.google_credentials c
  where c.user_id = p_user;
$$;

-- One sync result: logs the difference from the last count in the task
-- owner's name and moves last_*. A successful read also clears lost_access.
-- Returns the difference logged (0 when nothing was logged), or null when the
-- task was unlinked meanwhile.
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

  -- link_task_source always writes this row; recreate it if it is missing.
  insert into private.task_source_sync (task_id) values (p_task) on conflict (task_id) do nothing;
  select * into sync from private.task_source_sync where task_id = p_task for update;

  delta := p_count - sync.last_count;
  select t.owner_id into owner from project_tasks t where t.id = p_task;

  if delta <> 0 and owner is not null then
    insert into task_progress (task_id, user_id, progress_value, source)
    values (p_task, owner, delta,
            case when src.kind = 'slides' then 'google_slides' else 'google_docs' end);
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

-- Google refused the file (no access, deleted, token revoked).
create or replace function public.mark_task_source_lost(p_task uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update task_sources set state = 'lost_access' where task_id = p_task;
  update private.task_source_sync set last_checked_at = now() where task_id = p_task;
$$;


-- =============================================================================
-- 7. GRANTS
-- =============================================================================

-- Private tables: no privilege for anyone but the owner (postgres);
-- service_role too goes through the functions above.
revoke all on private.google_credentials from public, anon, authenticated, service_role;
revoke all on private.task_source_sync from public, anon, authenticated, service_role;

-- task_sources: logged-out requests get nothing; signed-in users read (RLS
-- decides which rows); nobody writes except through the functions.
revoke all on public.task_sources from public, anon, authenticated;
grant select on public.task_sources to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.task_sources from service_role;

revoke execute on function public.link_task_source(uuid, text, text, text, text) from public, anon;
revoke execute on function public.unlink_task_source(uuid) from public, anon;
revoke execute on function public.my_task_sync_status(uuid) from public, anon;
revoke execute on function public.has_google_connection() from public, anon;
revoke execute on function public.delete_my_google_credentials() from public, anon;
grant execute on function public.link_task_source(uuid, text, text, text, text) to authenticated;
grant execute on function public.unlink_task_source(uuid) to authenticated;
grant execute on function public.my_task_sync_status(uuid) to authenticated;
grant execute on function public.has_google_connection() to authenticated;
grant execute on function public.delete_my_google_credentials() to authenticated;

revoke execute on function public.save_google_credentials(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_google_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.record_synced_count(uuid, integer) from public, anon, authenticated;
revoke execute on function public.mark_task_source_lost(uuid) from public, anon, authenticated;
grant execute on function public.save_google_credentials(uuid, text, text) to service_role;
grant execute on function public.get_google_credentials(uuid) to service_role;
grant execute on function public.record_synced_count(uuid, integer) to service_role;
grant execute on function public.mark_task_source_lost(uuid) to service_role;

revoke execute on function public.keep_task_source() from public, anon, authenticated;
revoke execute on function public.release_sources_of_leaver() from public, anon, authenticated;


-- =============================================================================
-- VERIFY: supabase/tests/rls_google_sources.sql (run it as in CLAUDE.md "RLS
-- tests"; expect a final row reading 'all RLS tests passed'), then
-- rls_group_projects.sql again (can_log_task and the checks changed).
-- =============================================================================
