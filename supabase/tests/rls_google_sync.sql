-- =============================================================================
-- rls_google_sync.sql — RLS tests for 0026 (my Google connection, re-count
-- requests, what a sync reads)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK. A re-count request may queue a pg_net
-- call (if Vault is configured), but the queue row is rolled back with
-- everything else, so nothing is ever sent.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — class K, same pod F1, project P (live, one linked task)
--   C    — class K, alone in pod F2, project Q (past its deadline, one link)
--   O    — organizer of K
--
-- How to run: see "RLS tests" in CLAUDE.md. Before and after, count auth.users,
-- profiles and nudges and confirm they match.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000026a1', 'rls-test-ya@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000026b2', 'rls-test-yb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000026c3', 'rls-test-yc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000026e5', 'rls-test-yo@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000026c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000026e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000026a1', '00000000-0000-4000-8000-00000026c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000026b2', '00000000-0000-4000-8000-00000026c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000026c3', '00000000-0000-4000-8000-00000026c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000026e5', '00000000-0000-4000-8000-00000026c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000026f1', '00000000-0000-4000-8000-00000026c1a5'),
  ('00000000-0000-4000-8000-0000000026f2', '00000000-0000-4000-8000-00000026c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000026f1', '00000000-0000-4000-8000-0000000026a1'),
  ('00000000-0000-4000-8000-0000000026f1', '00000000-0000-4000-8000-0000000026b2'),
  ('00000000-0000-4000-8000-0000000026f2', '00000000-0000-4000-8000-0000000026c3');

insert into public.projects (id, pairing_id, title, created_by, start_date, deadline) values
  ('00000000-0000-4000-8000-000000260001', '00000000-0000-4000-8000-0000000026f1', 'Group talk',
   '00000000-0000-4000-8000-0000000026a1', (now() at time zone 'Asia/Tokyo')::date, null),
  ('00000000-0000-4000-8000-000000260002', '00000000-0000-4000-8000-0000000026f2', 'Finished group',
   '00000000-0000-4000-8000-0000000026c3', (now() at time zone 'Asia/Tokyo')::date - 20,
   (now() at time zone 'Asia/Tokyo')::date - 2);

insert into public.project_tasks (id, project_id, title, owner_id, metric, target_amount) values
  ('00000000-0000-4000-8000-000000260101', '00000000-0000-4000-8000-000000260001', 'Script',
   '00000000-0000-4000-8000-0000000026a1', 'characters', 2400),
  ('00000000-0000-4000-8000-000000260102', '00000000-0000-4000-8000-000000260002', 'Report',
   '00000000-0000-4000-8000-0000000026c3', 'characters', 1000);

-- Links as the owner (0023's link function needs a connection first).
insert into public.task_sources (task_id, kind, file_id, label, linked_by, state) values
  ('00000000-0000-4000-8000-000000260101', 'doc', '1DocFileAbCdEfGhIjKlMnOpQrStUvWx', 'Script',
   '00000000-0000-4000-8000-0000000026a1', 'lost_access'),
  ('00000000-0000-4000-8000-000000260102', 'doc', '1OtherDocAbCdEfGhIjKlMnOpQrStUv', 'Report',
   '00000000-0000-4000-8000-0000000026c3', 'ok');


-- =============================================================================
-- As A: saves and reads only their own connection; asks for a re-count
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000026a1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.save_my_google_credentials('v1.ivA.ciphertextA', 'sub-a');
  if (select refresh_token_enc from public.get_my_google_credentials()) <> 'v1.ivA.ciphertextA' then
    raise exception 'FAIL: A does not get their own saved connection back';
  end if;
  if not public.has_google_connection() then
    raise exception 'FAIL: has_google_connection is false after saving';
  end if;
  if (select state from public.task_sources where task_id = '00000000-0000-4000-8000-000000260101') <> 'ok' then
    raise exception 'FAIL: reconnecting did not set A''s lost link back to ok';
  end if;

  begin
    perform 1 from private.google_credentials;
    raise exception 'FAIL: A read private.google_credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.google_sync_requests;
    raise exception 'FAIL: A read private.google_sync_requests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.google_sources_to_sync(null);
    raise exception 'FAIL: A called google_sources_to_sync';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.call_signed_function('google_sync_function_url', '{"all": true}'::jsonb);
    raise exception 'FAIL: A called private.call_signed_function';
  exception when insufficient_privilege then null;
  end;

  -- One request, then 2 minutes of nothing.
  if not public.request_google_sync() then
    raise exception 'FAIL: A''s first re-count request was refused';
  end if;
  if public.request_google_sync() then
    raise exception 'FAIL: a second re-count within 2 minutes was accepted';
  end if;
end $$;

reset role;

-- The throttle row exists and A's ciphertext is A's alone.
do $$
begin
  if not exists (select 1 from private.google_sync_requests where user_id = '00000000-0000-4000-8000-0000000026a1') then
    raise exception 'FAIL: the re-count request was not recorded';
  end if;
  update private.google_sync_requests set requested_at = now() - interval '3 minutes'
   where user_id = '00000000-0000-4000-8000-0000000026a1';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000026a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not public.request_google_sync() then
    raise exception 'FAIL: a re-count after 2 minutes was refused';
  end if;
end $$;
reset role;


-- =============================================================================
-- As B (podmate, not connected): no connection of A's; can ask for a re-count
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000026b2","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.get_my_google_credentials()) then
    raise exception 'FAIL: B got a connection back (A''s?)';
  end if;
  if public.has_google_connection() then
    raise exception 'FAIL: has_google_connection is true for B';
  end if;
  -- Any member opening the board may ask: the counts stay honest either way.
  if not public.request_google_sync() then
    raise exception 'FAIL: a podmate''s re-count request was refused';
  end if;
end $$;

reset role;


-- =============================================================================
-- As O (organizer): nothing linked anywhere they belong
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000026e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.request_google_sync() then
    raise exception 'FAIL: an organizer asked for a re-count';
  end if;
end $$;
reset role;


-- =============================================================================
-- Logged out: nothing
-- =============================================================================

set local role anon;
do $$
begin
  begin perform public.save_my_google_credentials('x', null); raise exception 'FAIL: anon saved credentials';
  exception when insufficient_privilege then null; end;
  begin perform public.get_my_google_credentials(); raise exception 'FAIL: anon called get_my_google_credentials';
  exception when insufficient_privilege then null; end;
  begin perform public.request_google_sync(); raise exception 'FAIL: anon asked for a re-count';
  exception when insufficient_privilege then null; end;
end $$;
reset role;


-- =============================================================================
-- As service_role (the Edge Function): what a run reads
-- =============================================================================

set local role service_role;
do $$
declare
  p constant uuid := '00000000-0000-4000-8000-000000260001';
  q constant uuid := '00000000-0000-4000-8000-000000260002';
begin
  -- A request: every link of the projects asked for, deadline or not.
  if (select count(*) from public.google_sources_to_sync(array[p, q])) <> 2 then
    raise exception 'FAIL: a request did not return both projects'' links';
  end if;
  -- The 5-minute job: Q is past its deadline.
  if (select count(*) from public.google_sources_to_sync(null) where task_id = '00000000-0000-4000-8000-000000260102') <> 0 then
    raise exception 'FAIL: the job reads a project past its deadline';
  end if;
  if (select count(*) from public.google_sources_to_sync(null) where task_id = '00000000-0000-4000-8000-000000260101') <> 1 then
    raise exception 'FAIL: the job skipped a live link';
  end if;
end $$;
reset role;

-- Back-off: unchanged for a day and read 10 minutes ago → skipped; read 40
-- minutes ago → read again.
insert into private.task_source_sync (task_id, last_count, last_checked_at, last_changed_at)
values ('00000000-0000-4000-8000-000000260101', 100, now() - interval '10 minutes', now() - interval '2 days');

set local role service_role;
do $$
begin
  if exists (select 1 from public.google_sources_to_sync(null) where task_id = '00000000-0000-4000-8000-000000260101') then
    raise exception 'FAIL: the job did not back off a link unchanged for a day';
  end if;
end $$;
reset role;

update private.task_source_sync set last_checked_at = now() - interval '40 minutes'
 where task_id = '00000000-0000-4000-8000-000000260101';

set local role service_role;
do $$
begin
  if not exists (select 1 from public.google_sources_to_sync(null) where task_id = '00000000-0000-4000-8000-000000260101') then
    raise exception 'FAIL: the job never reads a quiet link again after 30 minutes';
  end if;
  if not exists (select 1 from public.google_sources_to_sync(array['00000000-0000-4000-8000-000000260001'::uuid])
                 where task_id = '00000000-0000-4000-8000-000000260101') then
    raise exception 'FAIL: a request was held back by the job''s back-off';
  end if;
end $$;
reset role;

-- Deleting an account takes its connection and throttle row with it.
do $$
begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000026a1';
  if exists (select 1 from private.google_credentials where user_id = '00000000-0000-4000-8000-0000000026a1')
     or exists (select 1 from private.google_sync_requests where user_id = '00000000-0000-4000-8000-0000000026a1') then
    raise exception 'FAIL: a deleted account left its Google rows behind';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
