-- =============================================================================
-- 0018_push_subscriptions.sql — Push notifications when a nudge arrives
-- =============================================================================
--
-- push_subscriptions: one row per device that turned 声かけの通知 on. A
-- student can read and delete their own rows. Rows are added only through
-- save_push_subscription (for auth.uid(), at most 5 per student); there is no
-- direct INSERT and no UPDATE, and anon can't touch the table. Rows cascade
-- from profiles, so delete_my_account removes them (unlike auth.flow_state in
-- 0017, this is a real foreign key).
--
-- Sending: an AFTER INSERT trigger on nudges queues one pg_net request to the
-- send-nudge-push Edge Function: always exactly one, whether or not the
-- recipient has push on, so the sender learns nothing. pg_net sends it after
-- the commit, so the insert takes the same time either way. The function URL
-- and the shared secret come from Vault at call time; if either is missing
-- (e.g. a preview branch) nothing is sent and the nudge is saved as usual.
--
-- Quiet hours (23:00–07:00 JST) are decided in the Edge Function, which parks
-- the nudge in push_held_nudges; pg_cron calls the function at 07:00 JST to
-- send one summary per recipient.
--
-- Tests: supabase/tests/rls_push_subscriptions.sql.
-- =============================================================================

-- Supabase creates schema net owned by supabase_admin and grants it (and its
-- request queue) to PUBLIC; postgres can't revoke that. The Data API doesn't
-- expose net, so students can't reach it, but the queue is not a place for a
-- secret: requests carry an HMAC signature instead (section 3), never the
-- secret itself.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;


-- =============================================================================
-- 1. Subscriptions
-- =============================================================================

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- Only real push services: otherwise a student could register any URL and
  -- make our function POST to it.
  endpoint     text not null unique check (
    char_length(endpoint) <= 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  p256dh       text not null check (char_length(p256dh) between 80 and 100 and p256dh ~ '^[A-Za-z0-9_-]+=*$'),
  auth         text not null check (char_length(auth) between 16 and 32 and auth ~ '^[A-Za-z0-9_-]+=*$'),
  -- The locale cookie isn't in the database; saved at subscribe time.
  locale       text not null check (locale in ('ja', 'en')),
  -- A short label such as 'Safari · iPhone', never the full user agent.
  user_agent   text check (char_length(user_agent) <= 64),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.push_subscriptions enable row level security;

create index push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at desc);

revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy "read own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "remove own push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The only way in. The endpoint is a secret only this browser holds, so
-- whoever presents it takes it over: a shared phone changes hands and the
-- previous student's row goes. A student keeps at most 5 devices; a 6th
-- removes the oldest.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_locale text, p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Two devices saving at once would both count 5 and both keep theirs.
  perform pg_advisory_xact_lock(hashtextextended('push:' || me::text, 0));

  delete from public.push_subscriptions where endpoint = p_endpoint;

  -- clock_timestamp, not now(): several saves in one transaction (the RLS
  -- test) still get an order, so "oldest" is well defined.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale, user_agent, created_at)
  values (me, p_endpoint, p_p256dh, p_auth, p_locale, left(p_user_agent, 64), clock_timestamp());

  delete from public.push_subscriptions
  where user_id = me
    and id not in (
      select id from public.push_subscriptions
      where user_id = me
      order by created_at desc, id desc
      limit 5
    );
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;


-- =============================================================================
-- 2. Nudges held during quiet hours
-- =============================================================================

create table public.push_held_nudges (
  nudge_id uuid primary key references public.nudges(id) on delete cascade,
  held_at  timestamptz not null default now()
);

-- RLS on and no policies: only the Edge Function (admin key) uses it.
alter table public.push_held_nudges enable row level security;
revoke all on public.push_held_nudges from public, anon, authenticated;


-- =============================================================================
-- 3. Calling the Edge Function
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Signs the request: x-push-signature = hex HMAC-SHA256(secret,
-- "<timestamp>.<body>"), where body is payload::text, exactly the bytes
-- pg_net sends. The Edge Function recomputes it and refuses timestamps more
-- than 5 minutes off. Someone who read the queue could at most replay that
-- one request for 5 minutes; they could never sign a new one.
create or replace function private.call_push_function(payload jsonb)
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
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';

  if fn_url is null or secret is null then
    return;  -- not configured here: no push, the nudge is still saved
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

revoke execute on function private.call_push_function(jsonb) from public, anon, authenticated;

create or replace function private.push_on_nudge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.call_push_function(jsonb_build_object('nudge_id', new.id));
  return null;
exception when others then
  -- A push is a courtesy: it must never stop the nudge from being saved.
  raise warning 'push_on_nudge failed: %', sqlstate;
  return null;
end;
$$;

revoke execute on function private.push_on_nudge() from public, anon, authenticated;

create trigger nudges_send_push
  after insert on public.nudges
  for each row execute function private.push_on_nudge();


-- =============================================================================
-- 4. 07:00 JST: send what was held overnight (pg_cron runs in UTC; Japan has
--    no daylight saving time)
-- =============================================================================

select cron.schedule(
  'flush-held-nudge-pushes',
  '0 22 * * *',
  $$select private.call_push_function('{"flush": true}'::jsonb)$$
);


-- =============================================================================
-- VERIFY: supabase/tests/rls_push_subscriptions.sql, then the six older files.
-- =============================================================================
