-- =============================================================================
-- 0026_google_sync.sql — saving a Google connection, and asking for a re-count
-- =============================================================================
-- Plan: docs/plans/automation-plan.md (section 1). Builds on 0023.
--
-- Decision (2026-10-26): counting runs ONLY in the sync-google-progress Edge
-- Function (admin key). The Next.js server never gets the Supabase admin key:
-- it acts as the signed-in student. So this adds:
--
-- 1. save_my_google_credentials / get_my_google_credentials: the student's
--    own row only. The token is AES-GCM ciphertext made with GOOGLE_TOKEN_KEY,
--    which only the Next.js server and the Edge Function hold; the database
--    and the browser never see the plain token. Storing your own ciphertext
--    can only break your own connection. (0023's service_role versions stay
--    for the Edge Function.)
--
-- 2. request_google_sync(): opening the project board asks the Edge Function
--    to re-count every linked task of the caller's projects. At most once per
--    2 minutes per student (private.google_sync_requests). Counts are still
--    written only by record_synced_count() (service_role), so a student can't
--    forge a number: the most they can do is ask for an honest re-count.
--
-- 3. google_sources_to_sync() (service_role): what a run should read. With
--    project ids (a request): all their links. Without (the 5-minute job):
--    links of projects not past their deadline, skipping a link that hasn't
--    changed for 24 hours if it was read in the last 30 minutes.
--
-- 4. private.call_signed_function(): 0018's signed pg_net call, for any
--    function URL kept in Vault (here google_sync_function_url). Same HMAC
--    secret (push_webhook_secret) and headers as 0018.
--
-- 5. pg_cron sync-google-progress: every 5 minutes, 07:00–23:55 JST.
--
-- Every table has RLS enabled in this file (rule 1).
-- =============================================================================


-- =============================================================================
-- 1. My own Google connection
-- =============================================================================

create or replace function public.save_my_google_credentials(p_refresh_token_enc text, p_google_sub text)
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
  insert into private.google_credentials (user_id, refresh_token_enc, google_sub)
  values (me, p_refresh_token_enc, p_google_sub)
  on conflict (user_id) do update
     set refresh_token_enc = excluded.refresh_token_enc,
         google_sub        = excluded.google_sub,
         connected_at      = now();
  -- Reconnecting makes the links I made readable again; the next sync checks.
  update task_sources set state = 'ok' where linked_by = me and state = 'lost_access';
end;
$$;

create or replace function public.get_my_google_credentials()
returns table (refresh_token_enc text)
language sql
security definer
set search_path = public
stable
as $$
  select c.refresh_token_enc from private.google_credentials c where c.user_id = auth.uid();
$$;


-- =============================================================================
-- 2. Asking for a re-count
-- =============================================================================

create table private.google_sync_requests (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  requested_at  timestamptz not null
);
alter table private.google_sync_requests enable row level security;
revoke all on private.google_sync_requests from public, anon, authenticated, service_role;

-- 0018's signed call, for a function URL kept in Vault under p_url_name.
create or replace function private.call_signed_function(p_url_name text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  secret text;
  ts text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = p_url_name;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if fn_url is null or secret is null then
    return;  -- not configured here: nothing is sent
  end if;
  ts := floor(extract(epoch from clock_timestamp()))::bigint::text;
  perform net.http_post(
    url := fn_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-timestamp', ts,
      'x-push-signature', encode(extensions.hmac(ts || '.' || payload::text, secret, 'sha256'), 'hex')
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- True when a re-count was asked for; false when it was asked for less than
-- 2 minutes ago or there is nothing linked in my projects.
create or replace function public.request_google_sync()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  ids uuid[];
  last_at timestamptz;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select array_agg(distinct pr.id) into ids
    from projects pr
    join pairing_members pm on pm.pairing_id = pr.pairing_id and pm.user_id = me
    join project_tasks t on t.project_id = pr.id
    join task_sources s on s.task_id = t.id;
  if ids is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('google-sync:' || me::text, 0));
  select requested_at into last_at from private.google_sync_requests where user_id = me;
  if last_at is not null and last_at > now() - interval '2 minutes' then
    return false;
  end if;
  insert into private.google_sync_requests (user_id, requested_at) values (me, now())
  on conflict (user_id) do update set requested_at = excluded.requested_at;

  perform private.call_signed_function('google_sync_function_url', jsonb_build_object('project_ids', to_jsonb(ids)));
  return true;
end;
$$;


-- =============================================================================
-- 3. What a run reads (service_role: the Edge Function)
-- =============================================================================

create or replace function public.google_sources_to_sync(p_project_ids uuid[] default null)
returns table (task_id uuid, kind text, file_id text, heading_id text, linked_by uuid)
language sql
security definer
set search_path = public
stable
as $$
  select s.task_id, s.kind, s.file_id, s.heading_id, s.linked_by
  from task_sources s
  join project_tasks t on t.id = s.task_id
  join projects pr on pr.id = t.project_id
  left join private.task_source_sync y on y.task_id = s.task_id
  where s.linked_by is not null
    and (
      (p_project_ids is not null and pr.id = any (p_project_ids))
      or (
        p_project_ids is null
        and (pr.deadline is null or pr.deadline >= (now() at time zone 'Asia/Tokyo')::date)
        and not (
          coalesce(y.last_changed_at, s.linked_at) < now() - interval '24 hours'
          and y.last_checked_at > now() - interval '30 minutes'
        )
      )
    )
  order by y.last_checked_at nulls first
  limit 500;
$$;


-- =============================================================================
-- 4. GRANTS
-- =============================================================================

revoke execute on function public.save_my_google_credentials(text, text) from public, anon;
revoke execute on function public.get_my_google_credentials() from public, anon;
revoke execute on function public.request_google_sync() from public, anon;
grant execute on function public.save_my_google_credentials(text, text) to authenticated;
grant execute on function public.get_my_google_credentials() to authenticated;
grant execute on function public.request_google_sync() to authenticated;

revoke execute on function public.google_sources_to_sync(uuid[]) from public, anon, authenticated;
grant execute on function public.google_sources_to_sync(uuid[]) to service_role;

revoke execute on function private.call_signed_function(text, jsonb) from public, anon, authenticated;


-- =============================================================================
-- 5. SCHEDULE: every 5 minutes, 07:00–23:55 JST (22:00–14:55 UTC)
-- =============================================================================

select cron.schedule(
  'sync-google-progress',
  '*/5 22-23,0-14 * * *',
  $$select private.call_signed_function('google_sync_function_url', '{"all": true}'::jsonb)
    where exists (select 1 from public.task_sources)$$
);


-- =============================================================================
-- VERIFY: supabase/tests/rls_google_sync.sql (expect 'all RLS tests passed'),
-- then rls_google_sources.sql again. Deploy sync-google-progress and add the
-- Vault secret google_sync_function_url before the job does anything.
-- =============================================================================
