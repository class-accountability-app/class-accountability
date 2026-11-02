-- =============================================================================
-- rls_google_health.sql — tests for 0042 (class_google_health)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK. Success: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): O organizer of K, X organizer of L, A a student of
-- K in team F with project P (tasks t1..t4). Links: t1 ok and counted today,
-- t2 lost, t3 ok but not counted for two days (linked three days ago), t4 ok
-- and linked an hour ago (not yet counted: not stuck). A finished project Q in
-- the same team has a lost link that must not count.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000042e5', 'rls-test-ho@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042e6', 'rls-test-hx@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042a1', 'rls-test-ha@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000042c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000042e5'),
  ('00000000-0000-4000-8000-00000042c1a6', 'RLS test class L', 'Test', 'test', '00000000-0000-4000-8000-0000000042e6');
insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000042e5', '00000000-0000-4000-8000-00000042c1a5', 'organizer'),
  ('00000000-0000-4000-8000-0000000042e6', '00000000-0000-4000-8000-00000042c1a6', 'organizer'),
  ('00000000-0000-4000-8000-0000000042a1', '00000000-0000-4000-8000-00000042c1a5', 'student');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000042f1', '00000000-0000-4000-8000-00000042c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000042f1', '00000000-0000-4000-8000-0000000042a1');

insert into public.projects (id, pairing_id, title, status, finished_at) values
  ('00000000-0000-4000-8000-000000420002', '00000000-0000-4000-8000-0000000042f1', 'Q', 'done', now() - interval '1 day');
insert into public.projects (id, pairing_id, title) values
  ('00000000-0000-4000-8000-000000420001', '00000000-0000-4000-8000-0000000042f1', 'P');

insert into public.project_tasks (id, project_id, title, owner_id, metric, unit) values
  ('00000000-0000-4000-8000-0000000042d1', '00000000-0000-4000-8000-000000420001', 'T1', '00000000-0000-4000-8000-0000000042a1', 'count', 'slides'),
  ('00000000-0000-4000-8000-0000000042d2', '00000000-0000-4000-8000-000000420001', 'T2', '00000000-0000-4000-8000-0000000042a1', 'count', 'slides'),
  ('00000000-0000-4000-8000-0000000042d3', '00000000-0000-4000-8000-000000420001', 'T3', '00000000-0000-4000-8000-0000000042a1', 'count', 'slides'),
  ('00000000-0000-4000-8000-0000000042d4', '00000000-0000-4000-8000-000000420001', 'T4', '00000000-0000-4000-8000-0000000042a1', 'count', 'slides'),
  ('00000000-0000-4000-8000-0000000042d9', '00000000-0000-4000-8000-000000420002', 'Old', '00000000-0000-4000-8000-0000000042a1', 'count', 'slides');

insert into public.task_sources (task_id, kind, file_id, label, linked_by, linked_at, state) values
  ('00000000-0000-4000-8000-0000000042d1', 'slides', 'TestFileId_0001', 'a', '00000000-0000-4000-8000-0000000042a1', now() - interval '3 days', 'ok'),
  ('00000000-0000-4000-8000-0000000042d2', 'slides', 'TestFileId_0002', 'b', '00000000-0000-4000-8000-0000000042a1', now() - interval '3 days', 'lost_access'),
  ('00000000-0000-4000-8000-0000000042d3', 'slides', 'TestFileId_0003', 'c', '00000000-0000-4000-8000-0000000042a1', now() - interval '3 days', 'ok'),
  ('00000000-0000-4000-8000-0000000042d4', 'slides', 'TestFileId_0004', 'd', '00000000-0000-4000-8000-0000000042a1', now() - interval '1 hour', 'ok'),
  ('00000000-0000-4000-8000-0000000042d9', 'slides', 'TestFileId_0009', 'e', '00000000-0000-4000-8000-0000000042a1', now() - interval '9 days', 'lost_access');

insert into private.task_source_sync (task_id, last_count, last_checked_at) values
  ('00000000-0000-4000-8000-0000000042d1', 3, now() - interval '10 minutes'),
  ('00000000-0000-4000-8000-0000000042d3', 3, now() - interval '2 days');

-- As O: 4 live links, 1 lost, 1 stuck (Q's link is left out).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000042e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.class_google_health('00000000-0000-4000-8000-00000042c1a5');
  if r.links <> 4 or r.lost <> 1 or r.stuck <> 1 then
    raise exception 'FAIL: expected 4 links, 1 lost, 1 stuck; got %', r;
  end if;
end $$;

-- As X (another class's organizer) and A (a student): no row.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000042e6","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.class_google_health('00000000-0000-4000-8000-00000042c1a5')) then
    raise exception 'FAIL: another class''s organizer must get no row';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000042a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.class_google_health('00000000-0000-4000-8000-00000042c1a5')) then
    raise exception 'FAIL: a student must get no row';
  end if;
end $$;

reset role;
set local role anon;
do $$
begin
  perform public.class_google_health('00000000-0000-4000-8000-00000042c1a5');
  raise exception 'FAIL: anon must not run class_google_health';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
