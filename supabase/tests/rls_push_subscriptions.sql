-- =============================================================================
-- rls_push_subscriptions.sql — tests for 0018 (push subscriptions, nudge push)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class,
-- a pod and push subscriptions, impersonates each user the way PostgREST does
-- (role + JWT claims), and checks what each one may do. Nothing it writes
-- survives. A nudge inserted here may queue a pg_net request, but the queue
-- row is rolled back with everything else, so nothing is ever sent.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — students in class K, together in pod P
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000004a1', 'rls-test-push-a@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004b2', 'rls-test-push-b@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term) values
  ('00000000-0000-4000-8000-00000000c401', 'RLS test class push', 'Test', 'test');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000004a1', '00000000-0000-4000-8000-00000000c401', 'student'),
  ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-00000000c401', 'student');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-000000004d01', '00000000-0000-4000-8000-00000000c401');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-000000004d01', '00000000-0000-4000-8000-0000000004a1'),
  ('00000000-0000-4000-8000-000000004d01', '00000000-0000-4000-8000-0000000004b2');

-- Valid-looking keys: p256dh is 87 base64url characters, auth 22.
create temporary table push_test_keys as
select repeat('B', 87) as p256dh, repeat('a', 22) as auth;
grant select on push_test_keys to anon, authenticated;


-- =============================================================================
-- Catalogue checks: students can't reach the private functions or write rows
-- =============================================================================

do $$
begin
  if has_schema_privilege('authenticated', 'private', 'usage')
     or has_function_privilege('authenticated', 'private.call_push_function(jsonb)', 'execute') then
    raise exception 'FAIL: students can call private.call_push_function';
  end if;

  if has_table_privilege('authenticated', 'public.push_subscriptions', 'insert')
     or has_table_privilege('authenticated', 'public.push_subscriptions', 'update') then
    raise exception 'FAIL: students have INSERT or UPDATE on push_subscriptions';
  end if;

  if not exists (select 1 from cron.job where jobname = 'flush-held-nudge-pushes' and schedule = '0 22 * * *') then
    raise exception 'FAIL: the 07:00 JST flush job is missing';
  end if;
end $$;


-- =============================================================================
-- Logged out: nothing at all
-- =============================================================================

select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  begin
    perform 1 from public.push_subscriptions;
    raise exception 'FAIL: anon read push_subscriptions';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.save_push_subscription(
      'https://fcm.googleapis.com/fcm/send/rls-test-anon', (select p256dh from push_test_keys),
      (select auth from push_test_keys), 'ja', 'test');
    raise exception 'FAIL: anon called save_push_subscription';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.push_held_nudges;
    raise exception 'FAIL: anon read push_held_nudges';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As A: saves through the function only; reads and deletes own rows
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  me constant uuid := '00000000-0000-4000-8000-0000000004a1';
  k record;
  n integer;
begin
  select * into k from push_test_keys;

  -- Direct INSERT is refused, even for yourself.
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale)
    values (me, 'https://fcm.googleapis.com/fcm/send/rls-test-direct', k.p256dh, k.auth, 'ja');
    raise exception 'FAIL: A inserted into push_subscriptions directly';
  exception when insufficient_privilege then null;
  end;

  perform public.save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/rls-test-a1', k.p256dh, k.auth, 'ja', 'Chrome · Windows');

  select count(*) into n from public.push_subscriptions;
  if n <> 1 then
    raise exception 'FAIL: A sees % subscriptions, expected 1', n;
  end if;

  if (select user_id from public.push_subscriptions) <> me then
    raise exception 'FAIL: the saved row is not A''s';
  end if;

  -- No UPDATE at all.
  begin
    update public.push_subscriptions set locale = 'en';
    raise exception 'FAIL: A updated a subscription';
  exception when insufficient_privilege then null;
  end;

  -- Only real push services.
  begin
    perform public.save_push_subscription(
      'https://attacker.example/push', k.p256dh, k.auth, 'ja', 'test');
    raise exception 'FAIL: a non-push-service endpoint was saved';
  exception when check_violation then null;
  end;

  begin
    perform public.save_push_subscription(
      'https://fcm.googleapis.com/fcm/send/rls-test-a-bad-locale', k.p256dh, k.auth, 'fr', 'test');
    raise exception 'FAIL: locale fr was saved';
  exception when check_violation then null;
  end;

  -- The held queue and the private functions are out of reach.
  begin
    perform 1 from public.push_held_nudges;
    raise exception 'FAIL: A read push_held_nudges';
  exception when insufficient_privilege then null;
  end;

  begin
    perform private.call_push_function('{"flush": true}'::jsonb);
    raise exception 'FAIL: A called private.call_push_function';
  exception when insufficient_privilege then null;
  end;

  -- Sending a nudge still works with the push trigger in place.
  insert into public.nudges (from_user_id, to_user_id, pairing_id, type, content)
  values (me, '00000000-0000-4000-8000-0000000004b2',
          '00000000-0000-4000-8000-000000004d01', 'reaction', 'rls test');

  -- Five more devices: the sixth save removes the oldest (a1).
  for i in 2..6 loop
    perform public.save_push_subscription(
      'https://fcm.googleapis.com/fcm/send/rls-test-a' || i, k.p256dh, k.auth, 'ja', 'test');
  end loop;

  select count(*) into n from public.push_subscriptions;
  if n <> 5 then
    raise exception 'FAIL: A has % subscriptions after 6 saves, expected 5', n;
  end if;

  if exists (select 1 from public.push_subscriptions
             where endpoint = 'https://fcm.googleapis.com/fcm/send/rls-test-a1') then
    raise exception 'FAIL: the oldest subscription survived the 6th device';
  end if;

  if not exists (select 1 from public.push_subscriptions
                 where endpoint = 'https://fcm.googleapis.com/fcm/send/rls-test-a6') then
    raise exception 'FAIL: the newest subscription is missing';
  end if;
end $$;

reset role;

-- The nudge was saved, and its push request (if Vault is configured) carries
-- a valid signature and never the secret itself.
do $$
declare
  nudge uuid;
  secret text;
  q record;
begin
  select id into nudge from public.nudges
  where from_user_id = '00000000-0000-4000-8000-0000000004a1';
  if nudge is null then
    raise exception 'FAIL: A''s nudge was not saved';
  end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  select * into q from net.http_request_queue
  where convert_from(body, 'UTF8') = jsonb_build_object('nudge_id', nudge)::text
  order by id desc limit 1;

  if secret is null then
    if q.id is not null then
      raise exception 'FAIL: a push request was queued without a secret in Vault';
    end if;
  else
    if q.id is null then
      raise exception 'FAIL: no push request was queued for the nudge';
    end if;
    if strpos(q.headers::text, secret) > 0 then
      raise exception 'FAIL: the webhook secret is in the queued request';
    end if;
    if q.headers ->> 'x-push-signature' is distinct from encode(extensions.hmac(
         (q.headers ->> 'x-push-timestamp') || '.' || convert_from(q.body, 'UTF8'), secret, 'sha256'), 'hex') then
      raise exception 'FAIL: the queued request has a wrong signature';
    end if;
  end if;
end $$;


-- =============================================================================
-- As B: sees none of A's rows, can't delete them; takes over a shared phone
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  k record;
  n integer;
begin
  select * into k from push_test_keys;

  if exists (select 1 from public.push_subscriptions) then
    raise exception 'FAIL: B can read A''s subscriptions';
  end if;

  delete from public.push_subscriptions
  where endpoint = 'https://fcm.googleapis.com/fcm/send/rls-test-a2';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: B deleted A''s subscription';
  end if;

  -- The phone that was A's device a2 is now B's.
  perform public.save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/rls-test-a2', k.p256dh, k.auth, 'en', 'Safari · iPhone');

  select count(*) into n from public.push_subscriptions;
  if n <> 1 then
    raise exception 'FAIL: B sees % subscriptions after taking over a2, expected 1', n;
  end if;
end $$;

reset role;

do $$
begin
  if (select user_id from public.push_subscriptions
      where endpoint = 'https://fcm.googleapis.com/fcm/send/rls-test-a2')
     <> '00000000-0000-4000-8000-0000000004b2' then
    raise exception 'FAIL: the shared phone did not change hands';
  end if;

  if (select count(*) from public.push_subscriptions
      where user_id = '00000000-0000-4000-8000-0000000004a1') <> 4 then
    raise exception 'FAIL: A should have 4 subscriptions left';
  end if;
end $$;


-- =============================================================================
-- As A: deletes one own row; then deletes the account, and the rest go too
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  delete from public.push_subscriptions
  where endpoint = 'https://fcm.googleapis.com/fcm/send/rls-test-a3';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: A could not delete their own subscription';
  end if;

  perform public.delete_my_account();
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.push_subscriptions
             where user_id = '00000000-0000-4000-8000-0000000004a1') then
    raise exception 'FAIL: delete_my_account left A''s subscriptions behind';
  end if;

  if not exists (select 1 from public.push_subscriptions
                 where user_id = '00000000-0000-4000-8000-0000000004b2') then
    raise exception 'FAIL: deleting A removed B''s subscription';
  end if;
end $$;


select 'all RLS tests passed' as result;

rollback;
