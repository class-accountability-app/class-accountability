-- =============================================================================
-- rls_class_project_list.sql — tests for 0029 + 0045 (the class's projects)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): O organizer of K; A, B students of K; X not in K.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000029a1', 'rls-test-ka@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000029b2', 'rls-test-kb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000029e5', 'rls-test-ko@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000029f6', 'rls-test-kx@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000029c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000029e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000029a1', '00000000-0000-4000-8000-00000029c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000029b2', '00000000-0000-4000-8000-00000029c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000029e5', '00000000-0000-4000-8000-00000029c1a5', 'organizer')
on conflict (user_id, class_id) do nothing;

-- As A (student): can't add a class project.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.add_class_project('00000000-0000-4000-8000-00000029c1a5', 'X', null, 4, '[]');
  raise exception 'FAIL: a student must not add a class project';
exception when insufficient_privilege then null;
end $$;

-- As O (organizer): adds the first one, with one bad task that must be skipped.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  cp1 uuid;
begin
  cp1 := public.add_class_project(
    '00000000-0000-4000-8000-00000029c1a5', '最終発表', ((now() at time zone 'Asia/Tokyo')::date + 30), 4,
    '[{"title":"発表原稿","metric":"characters","target":3000,"days_before":10},
      {"title":"スライド","metric":"count","unit":"枚","target":12,"days_before":5},
      {"title":"bad: count without unit","metric":"count","target":3},
      {"title":"リハーサル","metric":"status","days_before":2}]'::jsonb);
  perform set_config('rls_test.cp1', cp1::text, true);
  begin
    insert into public.class_projects (class_id, title) values ('00000000-0000-4000-8000-00000029c1a5', 'Y');
    raise exception 'FAIL: a client must not write class_projects directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- As A: reads the list; starting a team starts the project with the good tasks.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  pod uuid;
  pr  record;
  n   integer;
begin
  if not exists (select 1 from public.class_projects where class_id = '00000000-0000-4000-8000-00000029c1a5') then
    raise exception 'FAIL: a student of the class should read the class projects';
  end if;
  pod := public.create_pod('00000000-0000-4000-8000-00000029c1a5');
  select * into pr from public.projects where pairing_id = pod;
  if pr.id is null or pr.title <> '最終発表' or pr.deadline is null
     or pr.class_project_id is distinct from current_setting('rls_test.cp1')::uuid then
    raise exception 'FAIL: a new team should start with the class project, got %', pr;
  end if;
  select count(*) into n from public.project_tasks where project_id = pr.id;
  if n <> 3 then raise exception 'FAIL: expected 3 tasks (the bad one skipped), got %', n; end if;
  if exists (select 1 from public.project_tasks where project_id = pr.id and (owner_id is not null or due is null)) then
    raise exception 'FAIL: class tasks start with no owner and a due date';
  end if;
  perform set_config('rls_test.pod', pod::text, true);

  -- Only the database links a project to a class project.
  begin
    insert into public.projects (pairing_id, title, created_by, class_project_id)
    values (pod, 'forged link', '00000000-0000-4000-8000-0000000029a1', current_setting('rls_test.cp1')::uuid);
    raise exception 'FAIL: a student must not set class_project_id';
  exception when insufficient_privilege or unique_violation then null;
  end;
  begin
    update public.projects set class_project_id = null where id = pr.id;
    raise exception 'FAIL: a student must not change class_project_id';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_class_project(current_setting('rls_test.cp1')::uuid, 'hacked', null, 4, '[]');
    raise exception 'FAIL: a student must not edit a class project';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_class_project(current_setting('rls_test.cp1')::uuid);
    raise exception 'FAIL: a student must not remove a class project';
  exception when insufficient_privilege then null;
  end;
end $$;

-- As O: a second class project reaches the existing team at once; editing the
-- first one doesn't touch the team's copy.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  cp2 uuid;
begin
  cp2 := public.add_class_project('00000000-0000-4000-8000-00000029c1a5', '中間レポート', null, 7,
    '[{"title":"下書き","metric":"characters","target":2000}]'::jsonb);
  perform set_config('rls_test.cp2', cp2::text, true);
  perform public.update_class_project(current_setting('rls_test.cp1')::uuid, '最終発表（改）', null, 5, '[]');
  if (select count(*) from public.class_projects where class_id = '00000000-0000-4000-8000-00000029c1a5') <> 2 then
    raise exception 'FAIL: the class should list two projects';
  end if;
end $$;

-- As A: the team now runs both, the copy kept its title; A finishes the second.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  pod uuid := current_setting('rls_test.pod')::uuid;
  p2  record;
begin
  if (select count(*) from public.projects where pairing_id = pod and status = 'active') <> 2 then
    raise exception 'FAIL: the team should have both class projects active';
  end if;
  select * into p2 from public.projects
  where pairing_id = pod and class_project_id = current_setting('rls_test.cp2')::uuid;
  if p2.id is null or p2.created_by is not null or p2.checkin_every_days <> 7 then
    raise exception 'FAIL: the second class project should be the team''s, with no creator: %', p2;
  end if;
  if (select count(*) from public.project_tasks where project_id = p2.id) <> 1 then
    raise exception 'FAIL: the second project should have its one task';
  end if;
  if not exists (select 1 from public.projects where pairing_id = pod and title = '最終発表') then
    raise exception 'FAIL: editing a class project must not rename the team''s copy';
  end if;
  perform public.finish_project(p2.id);
end $$;

-- B joins the same team: nothing is given twice, also not the finished one.
reset role;
insert into public.pairing_members (pairing_id, user_id)
values (current_setting('rls_test.pod')::uuid, '00000000-0000-4000-8000-0000000029b2');
do $$
begin
  if (select count(*) from public.projects where pairing_id = current_setting('rls_test.pod')::uuid) <> 2 then
    raise exception 'FAIL: a second member must not start the class projects again';
  end if;
end $$;

-- As O: the summary has one row per active project; removing a class project
-- leaves the team's copy; the list stops at 10.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
  n integer;
begin
  select count(*) into n from public.class_team_summary('00000000-0000-4000-8000-00000029c1a5');
  if n <> 1 then raise exception 'FAIL: expected 1 summary row (one active project), got %', n; end if;
  select * into r from public.class_team_summary('00000000-0000-4000-8000-00000029c1a5');
  if r.team_no <> 1 or not r.has_project or r.project_title <> '最終発表' or r.task_count <> 3 then
    raise exception 'FAIL: the summary row should be the active class project: %', r;
  end if;

  perform public.delete_class_project(current_setting('rls_test.cp2')::uuid);
  for i in 1..9 loop
    perform public.add_class_project('00000000-0000-4000-8000-00000029c1a5', 'extra ' || i, null, 4, '[]');
  end loop;
  begin
    perform public.add_class_project('00000000-0000-4000-8000-00000029c1a5', 'one too many', null, 4, '[]');
    raise exception 'FAIL: an 11th class project must be refused';
  exception when sqlstate 'SP020' then null;
  end;
  select count(*) into n from public.class_team_summary('00000000-0000-4000-8000-00000029c1a5');
  if n <> 10 then raise exception 'FAIL: expected 10 summary rows (1 + 9 new projects), got %', n; end if;
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.projects
                 where pairing_id = current_setting('rls_test.pod')::uuid
                   and title = '中間レポート' and class_project_id is null and status = 'done') then
    raise exception 'FAIL: removing a class project must leave the team''s copy, unlinked';
  end if;
end $$;

-- As X (not in the class): can't read the list or the summary.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029f6","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.class_projects) then
    raise exception 'FAIL: someone outside the class must not read its class projects';
  end if;
  if exists (select 1 from public.class_team_summary('00000000-0000-4000-8000-00000029c1a5')) then
    raise exception 'FAIL: someone outside the class must get no summary';
  end if;
end $$;

-- Logged out.
reset role;
set local role anon;
do $$
begin
  perform 1 from public.class_projects;
  raise exception 'FAIL: anon must not read class_projects';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
