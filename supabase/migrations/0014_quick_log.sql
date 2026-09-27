-- =============================================================================
-- 0014_quick_log.sql — quick log (screens 09, 10, 11): edit your own logs,
-- double-tap safety, and a log's time set by the server
-- =============================================================================
--
-- 1. AMOUNTS STAY POSITIVE. The app has always checked; now the database
--    does too (no existing row breaks it).
--
-- 2. DOUBLE-TAP SAFETY. The quick-log sheet makes one client_id each time it
--    opens and sends it with 記録する. unique (user_id, client_id) means a
--    second tap or a retry after a network failure can't add a second log;
--    the server action treats that unique violation as "already saved".
--    Older rows keep null (a unique constraint allows many nulls).
--
-- 3. EDIT YOUR OWN LOGS. A new UPDATE policy (delete-own already exists,
--    0001). Only the amount and the memo can change: whose log it is, its
--    target, its time, its client_id and its source are fixed for everyone,
--    like keep_target_class (0013). Podmates' totals are summed from the logs
--    on every read, so an edit or delete is always reflected.
--
-- 4. THE SERVER SETS THE TIME of a student's log, so a log can't be
--    backdated on insert either. Inserts by the project owner (fixtures, the
--    RLS tests' setup) keep their value, like add_creator_membership (0013).
--
-- Comments on a log still go with it (on delete cascade, 0008).
-- No new tables. Tests: supabase/tests/rls_quick_log.sql.
-- =============================================================================


-- 1. Amounts stay positive.
alter table public.progress_logs
  add constraint progress_logs_value_positive check (progress_value > 0);


-- 2. Double-tap safety.
alter table public.progress_logs add column client_id uuid;

alter table public.progress_logs
  add constraint progress_logs_user_client_id_key unique (user_id, client_id);


-- 3. Edit your own logs; only the amount and the memo change.
create policy "update own progress" on public.progress_logs
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.keep_progress_log_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.target_id is distinct from old.target_id
     or new.logged_at is distinct from old.logged_at
     or new.client_id is distinct from old.client_id
     or new.source is distinct from old.source then
    raise exception 'only a log''s amount and memo can be edited' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_progress_log_identity() from public, anon, authenticated;

create trigger progress_logs_keep_identity
  before update on public.progress_logs
  for each row execute function public.keep_progress_log_identity();


-- 4. The server sets the time of a student's log.
create or replace function public.set_progress_log_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.logged_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.set_progress_log_time() from public, anon, authenticated;

create trigger progress_logs_server_time
  before insert on public.progress_logs
  for each row execute function public.set_progress_log_time();


-- =============================================================================
-- VERIFY
--   select conname from pg_constraint
--   where conrelid = 'public.progress_logs'::regclass
--     and conname in ('progress_logs_value_positive', 'progress_logs_user_client_id_key');
--   -- 2 rows
-- Then run supabase/tests/rls_quick_log.sql and the three older files.
-- =============================================================================
