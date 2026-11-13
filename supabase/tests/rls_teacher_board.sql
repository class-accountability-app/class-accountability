-- =============================================================================
-- rls_teacher_board.sql — tests for 0046 (the teacher's read-only team board)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): O organizer of K; P organizer of another class K2;
-- A, B students of K in team F with project J; X a student of K in no team.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000046a1', 'rls-test-ta@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000046b2', 'rls-test-tb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000046e5', 'rls-test-to@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000046e6', 'rls-test-tp@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000046f6', 'rls-test-tx@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000046c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000046e5'),
  ('00000000-0000-4000-8000-00000046c2a5', 'RLS test class K2', 'Test', 'test', '00000000-0000-4000-8000-0000000046e6');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000046a1', '00000000-0000-4000-8000-00000046c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000046b2', '00000000-0000-4000-8000-00000046c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000046f6', '00000000-0000-4000-8000-00000046c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000046e5', '00000000-0000-4000-8000-00000046c1a5', 'organizer'),
  ('00000000-0000-4000-8000-0000000046e6', '00000000-0000-4000-8000-00000046c2a5', 'organizer')
on conflict (user_id, class_id) do nothing;

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000046f1', '00000000-0000-4000-8000-00000046c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000046f1', '00000000-0000-4000-8000-0000000046a1'),
  ('00000000-0000-4000-8000-0000000046f1', '00000000-0000-4000-8000-0000000046b2');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000460001', '00000000-0000-4000-8000-0000000046f1', 'J',
   '00000000-0000-4000-8000-0000000046a1');
insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount, status) values
  ('00000000-0000-4000-8000-000000460101', '00000000-0000-4000-8000-000000460001', 'Slides',
   '00000000-0000-4000-8000-0000000046a1', 'count', 'slides', 10, 'doing');
insert into public.task_progress (task_id, user_id, progress_value, note) values
  ('00000000-0000-4000-8000-000000460101', '00000000-0000-4000-8000-0000000046a1', 5, 'PRIVATE-MEMO');
insert into public.project_links (project_id, title, url, added_by) values
  ('00000000-0000-4000-8000-000000460001', 'Shared folder', 'https://example.com/folder',
   '00000000-0000-4000-8000-0000000046a1');

-- One check-in from before the teacher's view began, one after.
insert into public.project_checkins (project_id, user_id, round_start, note, snapshot, created_at) values
  ('00000000-0000-4000-8000-000000460001', '00000000-0000-4000-8000-0000000046a1', date '2026-11-01',
   'OLD-NOTE', '[]'::jsonb, private.teacher_view_since() - interval '1 day'),
  ('00000000-0000-4000-8000-000000460001', '00000000-0000-4000-8000-0000000046b2', date '2026-11-20',
   'NEW-NOTE', '[{"task_id":"00000000-0000-4000-8000-000000460101","title":"Slides","total":5}]'::jsonb,
   private.teacher_view_since() + interval '1 day');

-- As O (organizer of K): the picker and the whole board, nothing private.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000046e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  b jsonb;
  r record;
begin
  select * into r from public.organizer_class_teams('00000000-0000-4000-8000-00000046c1a5');
  if r.project_id is distinct from '00000000-0000-4000-8000-000000460001'::uuid or r.team_no <> 1 then
    raise exception 'FAIL: the organizer should list team 1 with project J: %', r;
  end if;

  b := public.organizer_team_board('00000000-0000-4000-8000-000000460001');
  if b is null or b->'project'->>'title' <> 'J' or jsonb_array_length(b->'team'->'members') <> 2 then
    raise exception 'FAIL: the organizer should read the board: %', b;
  end if;
  if (b->'tasks'->0->>'total')::numeric <> 5 or b->'tasks'->0->>'owner' is null then
    raise exception 'FAIL: the board should show the task''s owner and total: %', b->'tasks';
  end if;
  if jsonb_array_length(b->'checkins') <> 1 or b->'checkins'->0->>'note' <> 'NEW-NOTE' then
    raise exception 'FAIL: only check-ins made after the view began are shown: %', b->'checkins';
  end if;
  if jsonb_array_length(b->'links') <> 1 then
    raise exception 'FAIL: the board should show the team''s links';
  end if;
  if b::text like '%OLD-NOTE%' or b::text like '%PRIVATE-MEMO%' or b::text like '%@andrew.ac.jp%'
     or b::text like '%0000000046a1%' then
    raise exception 'FAIL: the board leaked an old note, a memo, an email or a user id';
  end if;

  -- Still no direct table access for the organizer, and nothing to write with.
  if exists (select 1 from public.project_tasks) or exists (select 1 from public.project_checkins)
     or exists (select 1 from public.task_progress) or exists (select 1 from public.project_links) then
    raise exception 'FAIL: the organizer must not read the team''s tables directly';
  end if;
  update public.project_tasks set title = 'hacked' where id = '00000000-0000-4000-8000-000000460101';
  if found then raise exception 'FAIL: the organizer must not edit a task'; end if;
end $$;

-- As P (organizer of another class), A (a student of the team) and X (a
-- classmate): no board and no picker rows.
do $$
declare
  u text;
begin
  foreach u in array array['00000000-0000-4000-8000-0000000046e6', '00000000-0000-4000-8000-0000000046a1',
                           '00000000-0000-4000-8000-0000000046f6'] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', u), true);
    if public.organizer_team_board('00000000-0000-4000-8000-000000460001') is not null then
      raise exception 'FAIL: % must not read the teacher''s board', u;
    end if;
    if exists (select 1 from public.organizer_class_teams('00000000-0000-4000-8000-00000046c1a5')) then
      raise exception 'FAIL: % must not list the class''s teams', u;
    end if;
  end loop;
end $$;

-- Logged out.
reset role;
set local role anon;
do $$
begin
  begin
    perform public.organizer_team_board('00000000-0000-4000-8000-000000460001');
    raise exception 'FAIL: anon must not run organizer_team_board';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.organizer_class_teams('00000000-0000-4000-8000-00000046c1a5');
    raise exception 'FAIL: anon must not run organizer_class_teams';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
