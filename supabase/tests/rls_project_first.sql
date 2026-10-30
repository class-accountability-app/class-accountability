-- =============================================================================
-- rls_project_first.sql — tests for 0027 (live totals, the teacher's summary)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, same pod F1 with project P (A owns a counted task, B logs nothing)
--   C    — class K, no pod
--   D    — class K, alone in pod F2 (no project)
--   O    — organizer of K
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000027a1', 'rls-test-pa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000027b2', 'rls-test-pb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000027c3', 'rls-test-pc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000027d4', 'rls-test-pd@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000027e5', 'rls-test-po@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000027c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000027e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000027a1', '00000000-0000-4000-8000-00000027c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000027b2', '00000000-0000-4000-8000-00000027c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000027c3', '00000000-0000-4000-8000-00000027c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000027d4', '00000000-0000-4000-8000-00000027c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000027e5', '00000000-0000-4000-8000-00000027c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000027f1', '00000000-0000-4000-8000-00000027c1a5'),
  ('00000000-0000-4000-8000-0000000027f2', '00000000-0000-4000-8000-00000027c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000027f1', '00000000-0000-4000-8000-0000000027a1'),
  ('00000000-0000-4000-8000-0000000027f1', '00000000-0000-4000-8000-0000000027b2'),
  ('00000000-0000-4000-8000-0000000027f2', '00000000-0000-4000-8000-0000000027d4');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000270001', '00000000-0000-4000-8000-0000000027f1', 'P',
   '00000000-0000-4000-8000-0000000027a1');

insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount, status) values
  ('00000000-0000-4000-8000-000000270101', '00000000-0000-4000-8000-000000270001', 'Slides',
   '00000000-0000-4000-8000-0000000027a1', 'count', 'slides', 10, 'doing'),
  ('00000000-0000-4000-8000-000000270102', '00000000-0000-4000-8000-000000270001', 'Refs',
   null, 'status', null, null, 'done');

insert into public.task_progress (task_id, user_id, progress_value, note) values
  ('00000000-0000-4000-8000-000000270101', '00000000-0000-4000-8000-0000000027a1', 3, 'private memo'),
  ('00000000-0000-4000-8000-000000270101', '00000000-0000-4000-8000-0000000027a1', 2, null);

-- =============================================================================
-- As B: a teammate sees A's live total, but still not A's entries or memo
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000027b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p   constant uuid := '00000000-0000-4000-8000-000000270001';
  t1  constant uuid := '00000000-0000-4000-8000-000000270101';
  n   numeric;
  c   integer;
begin
  select total into n from public.project_task_totals(p) where task_id = t1;
  if n is distinct from 5 then
    raise exception 'FAIL: a teammate should see the live total 5, got %', n;
  end if;
  select count(*) into c from public.project_task_totals(p);
  if c <> 2 then raise exception 'FAIL: every task of the project should have a total row'; end if;

  select count(*) into c from public.task_progress where task_id = t1;
  if c <> 0 then raise exception 'FAIL: a teammate must not read the owner''s progress entries (memos)'; end if;

  select count(*) into c from public.class_team_summary('00000000-0000-4000-8000-00000027c1a5');
  if c <> 0 then raise exception 'FAIL: a student must not get the teacher summary'; end if;
end $$;

-- =============================================================================
-- As C (no pod) and D (another pod): no totals
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000027c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.project_task_totals('00000000-0000-4000-8000-000000270001')) then
    raise exception 'FAIL: a classmate without the pod must not see totals';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000027d4","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.project_task_totals('00000000-0000-4000-8000-000000270001')) then
    raise exception 'FAIL: a student in another pod must not see totals';
  end if;
end $$;

-- =============================================================================
-- As O (organizer): the per-team summary, and still no totals
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000027e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
  c integer;
begin
  if exists (select 1 from public.project_task_totals('00000000-0000-4000-8000-000000270001')) then
    raise exception 'FAIL: an organizer must not see a pod''s task totals';
  end if;

  select count(*) into c from public.class_team_summary('00000000-0000-4000-8000-00000027c1a5');
  if c <> 2 then raise exception 'FAIL: the summary should have one row per active pod, got %', c; end if;

  select * into r from public.class_team_summary('00000000-0000-4000-8000-00000027c1a5') where team_no = 1;
  -- Slides 5/10 = 0.5, Refs done = 1 → 75%.
  if r.members <> 2 or not r.has_project or r.task_count <> 2 or r.percent <> 75 then
    raise exception 'FAIL: team 1 summary is wrong: %', r;
  end if;

  select * into r from public.class_team_summary('00000000-0000-4000-8000-00000027c1a5') where team_no = 2;
  if r.members <> 1 or r.has_project or r.percent <> 0 then
    raise exception 'FAIL: team 2 (no project) summary is wrong: %', r;
  end if;
end $$;

-- =============================================================================
-- Logged out: execute is not granted to anon
-- =============================================================================
reset role;
set local role anon;
do $$
begin
  begin
    perform public.class_team_summary('00000000-0000-4000-8000-00000027c1a5');
    raise exception 'FAIL: anon must not run class_team_summary';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.project_task_totals('00000000-0000-4000-8000-000000270001');
    raise exception 'FAIL: anon must not run project_task_totals';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
