-- =============================================================================
-- 0019_documents.sql — 「Study Pods で書く」 (Prompt 12): a character_count
-- target whose text is written in the app. The text is the owner's alone;
-- podmates see only its count, through progress_logs like any other target.
-- =============================================================================
--
-- 1. targets.input_mode: 'manual' (＋記録, as today) or 'document'. Only
--    character_count targets can be documents. A target with logs can't
--    become a document, and a document with text can't go back (SP006).
--    targets (id, user_id) is already unique (0009), so documents can point
--    at both.
-- 2. documents (one per document target) and document_versions (history,
--    newest 50 kept). Signed-in users may only SELECT their own rows. Writes
--    go through save_document / keep_document_version, so the text, its
--    count, the version number and the progress logs always change together.
--    At most 100,000 characters and 1,000,000 bytes of JSON (SP005).
-- 3. progress_logs gets source 'document', written only by save_document:
--    each save logs (new count − everything logged so far) into the current
--    writing session's row (a new row after 30 minutes or on a new Tokyo
--    day). Rows can be negative when text is deleted; their sum always
--    equals the count, so totals, 今週 and podmates' views are unchanged.
--    Manual logs keep every 0014 rule. Students can't add, edit or delete a
--    'document' row directly, nor ＋記録 on a document target (SP007). A
--    'document' row may be deleted only by a cascade (deleting the target or
--    the account), which runs inside the foreign key's own trigger
--    (pg_trigger_depth() > 1).
-- 4. Deleting the target or the account deletes the document and its
--    versions (FK cascades). No auth.* table is involved (cf. 0017).
--
-- The research metrics (Prompt 13) use counts only, never the text.
-- Tests: supabase/tests/rls_documents.sql.
-- =============================================================================


-- 1. TARGETS: INPUT MODE ------------------------------------------------------

alter table public.targets
  add column input_mode text not null default 'manual'
    check (input_mode in ('manual', 'document'));

alter table public.targets
  add constraint targets_document_counts_characters
    check (input_mode = 'manual' or target_type = 'character_count');


-- 2. DOCUMENTS AND VERSIONS ---------------------------------------------------

create table public.documents (
  target_id   uuid primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content     jsonb not null,
  char_count  integer not null default 0 check (char_count between 0 and 100000),
  version     integer not null default 0 check (version >= 0),
  updated_at  timestamptz not null default now(),
  constraint documents_target_owner_fk foreign key (target_id, user_id)
    references public.targets (id, user_id) on delete cascade,
  constraint documents_target_user_key unique (target_id, user_id),
  constraint documents_content_size check (octet_length(content::text) <= 1000000)
);

alter table public.documents enable row level security;

create index documents_user_idx on public.documents (user_id);

create table public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null,
  user_id     uuid not null,
  content     jsonb not null,
  char_count  integer not null check (char_count between 0 and 100000),
  reason      text not null check (reason in ('autosave', 'before_restore', 'conflict')),
  created_at  timestamptz not null default now(),
  constraint document_versions_document_fk foreign key (target_id, user_id)
    references public.documents (target_id, user_id) on delete cascade,
  constraint document_versions_content_size check (octet_length(content::text) <= 1000000)
);

alter table public.document_versions enable row level security;

create index document_versions_target_created_idx
  on public.document_versions (target_id, created_at desc);

create policy "read own document" on public.documents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "read own document versions" on public.document_versions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No podmate, organizer or logged-out access; writes only via the functions.
revoke all on public.documents, public.document_versions from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.documents, public.document_versions from authenticated;
grant select on public.documents, public.document_versions to authenticated;


-- 3. A TARGET'S MODE ----------------------------------------------------------

create or replace function public.keep_target_input_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.input_mode is distinct from old.input_mode then
    if old.input_mode = 'manual'
       and exists (select 1 from progress_logs where target_id = old.id) then
      raise exception 'a target with logs can''t become a document' using errcode = 'SP006';
    end if;
    if old.input_mode = 'document'
       and (exists (select 1 from documents where target_id = old.id and char_count > 0)
            or exists (select 1 from document_versions where target_id = old.id and char_count > 0)) then
      raise exception 'a document with text can''t go back to manual' using errcode = 'SP006';
    end if;
    -- An empty document goes with the switch, with any zero-sum session rows.
    delete from documents where target_id = old.id;
    delete from progress_logs where target_id = old.id and source = 'document';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_target_input_mode() from public, anon, authenticated;

create trigger targets_keep_input_mode
  before update on public.targets
  for each row execute function public.keep_target_input_mode();


-- 4. PROGRESS LOGS ------------------------------------------------------------

alter table public.progress_logs drop constraint progress_logs_source_check;
alter table public.progress_logs add constraint progress_logs_source_check
  check (source in ('manual', 'google_docs', 'document'));

-- 0014's rule stands for every manual log; only document rows may be ≤ 0.
alter table public.progress_logs drop constraint progress_logs_value_positive;
alter table public.progress_logs add constraint progress_logs_value_positive
  check (progress_value > 0 or source = 'document');

-- Checks requests from the app's roles (signed in, or not). save_document and
-- keep_target_input_mode (security definer, they run as their owner) and the
-- project owner's SQL are not checked. A 'document' row's DELETE is allowed
-- inside a cascade: Postgres runs a foreign key's ON DELETE CASCADE as the
-- referencing table's owner, nested in the key's own trigger (depth 2), so it
-- passes either way; a student's direct DELETE runs as authenticated at
-- depth 1 and is refused.
create or replace function public.guard_document_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.source <> 'manual' then
      raise exception 'only manual logs can be added' using errcode = '42501';
    end if;
    if exists (select 1 from targets where id = new.target_id and input_mode = 'document') then
      raise exception 'a document target is logged by its editor' using errcode = 'SP007';
    end if;
    return new;
  end if;
  if old.source <> 'manual' then
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'only manual logs can be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.guard_document_progress() from public, anon, authenticated;

create trigger progress_logs_guard_document
  before insert or update or delete on public.progress_logs
  for each row execute function public.guard_document_progress();


-- 5. SAVING -------------------------------------------------------------------

create or replace function public.save_document(
  p_target uuid,
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
  doc documents%rowtype;
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

  -- My own document target only. The row lock makes saves of one document
  -- run one at a time (two tabs, two devices).
  perform 1 from targets t
  where t.id = p_target and t.user_id = me and t.input_mode = 'document'
  for update;
  if not found then
    raise exception 'not a document target of yours' using errcode = '42501';
  end if;

  select * into doc from documents d where d.target_id = p_target;
  if not found then
    insert into documents (target_id, user_id, content)
    values (p_target, me, '{"type":"doc","content":[]}'::jsonb)
    returning * into doc;
  end if;

  -- Changed elsewhere: write nothing and say so; the student chooses.
  if doc.version <> p_expected_version then
    return query select 'conflict'::text, doc.version, doc.char_count, doc.updated_at;
    return;
  end if;

  -- Before a restore, or when keeping my text over the other one: what is
  -- saved now becomes a version first.
  if p_keep_current is not null then
    insert into document_versions (target_id, user_id, content, char_count, reason)
    values (p_target, me, doc.content, doc.char_count, p_keep_current);
  end if;

  update documents d
  set content = p_content,
      char_count = p_char_count,
      version = d.version + 1,
      updated_at = now()
  where d.target_id = p_target
  returning * into doc;

  -- History: one autosave version per 10 minutes of editing, newest 50 kept.
  if not exists (
    select 1 from document_versions v
    where v.target_id = p_target and v.reason = 'autosave'
      and v.created_at > now() - interval '10 minutes'
  ) then
    insert into document_versions (target_id, user_id, content, char_count, reason)
    values (p_target, me, p_content, p_char_count, 'autosave');
  end if;

  delete from document_versions v
  where v.target_id = p_target
    and v.id not in (
      select v2.id from document_versions v2
      where v2.target_id = p_target
      order by v2.created_at desc
      limit 50
    );

  -- Progress: log the difference between the count and everything logged.
  select coalesce(sum(l.progress_value), 0) into logged
  from progress_logs l where l.target_id = p_target;
  delta := p_char_count - logged;

  if delta <> 0 then
    select l.id into session_id
    from progress_logs l
    where l.target_id = p_target
      and l.source = 'document'
      and l.logged_at > now() - interval '30 minutes'
      and (l.logged_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date
    order by l.logged_at desc
    limit 1;

    if session_id is not null then
      update progress_logs l set progress_value = l.progress_value + delta where l.id = session_id;
    else
      insert into progress_logs (user_id, target_id, source, progress_value)
      values (me, p_target, 'document', delta);
    end if;
  end if;

  return query select 'saved'::text, doc.version, doc.char_count, doc.updated_at;
end;
$$;

revoke execute on function public.save_document(uuid, integer, jsonb, integer, text) from public, anon;
grant execute on function public.save_document(uuid, integer, jsonb, integer, text) to authenticated;

-- 「あちらを開く」 after a conflict: my unsaved text is kept as a version
-- before the other one loads.
create or replace function public.keep_document_version(
  p_target uuid,
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

  perform 1 from documents d
  where d.target_id = p_target and d.user_id = me
  for update;
  if not found then
    raise exception 'not a document of yours' using errcode = '42501';
  end if;

  insert into document_versions (target_id, user_id, content, char_count, reason)
  values (p_target, me, p_content, p_char_count, 'conflict');

  delete from document_versions v
  where v.target_id = p_target
    and v.id not in (
      select v2.id from document_versions v2
      where v2.target_id = p_target
      order by v2.created_at desc
      limit 50
    );
end;
$$;

revoke execute on function public.keep_document_version(uuid, jsonb, integer) from public, anon;
grant execute on function public.keep_document_version(uuid, jsonb, integer) to authenticated;


-- =============================================================================
-- VERIFY
--   select relname, relrowsecurity from pg_class
--   where relname in ('documents', 'document_versions');           -- both true
--   select conname from pg_constraint
--   where conrelid = 'public.progress_logs'::regclass
--     and conname in ('progress_logs_source_check', 'progress_logs_value_positive');  -- 2
-- Then run supabase/tests/rls_documents.sql and every older file.
-- =============================================================================
