-- =============================================================================
-- rls_class_project.sql — tests for 0029 (the class project)
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

-- As A (student): can't set the class project.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.set_class_project('00000000-0000-4000-8000-00000029c1a5', 'X', null, 4, '[]');
  raise exception 'FAIL: a student must not set the class project';
exception when insufficient_privilege then null;
end $$;

-- As O (organizer): sets it, with one bad task that must be skipped.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.set_class_project(
    '00000000-0000-4000-8000-00000029c1a5', '最終発表', ((now() at time zone 'Asia/Tokyo')::date + 30), 4,
    '[{"title":"発表原稿","metric":"characters","target":3000,"days_before":10},
      {"title":"スライド","metric":"count","unit":"枚","target":12,"days_before":5},
      {"title":"bad: count without unit","metric":"count","target":3},
      {"title":"リハーサル","metric":"status","days_before":2}]'::jsonb);
  begin
    insert into public.class_projects (class_id, title) values ('00000000-0000-4000-8000-00000029c1a5', 'Y');
    raise exception 'FAIL: a client must not write class_projects directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- As A: reads it; starting a team starts the project with the good tasks.
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
    raise exception 'FAIL: a student of the class should read the class project';
  end if;
  pod := public.create_pod('00000000-0000-4000-8000-00000029c1a5');
  select * into pr from public.projects where pairing_id = pod;
  if pr.id is null or pr.title <> '最終発表' or pr.deadline is null then
    raise exception 'FAIL: a new team should start with the class project, got %', pr;
  end if;
  select count(*) into n from public.project_tasks where project_id = pr.id;
  if n <> 3 then raise exception 'FAIL: expected 3 tasks (the bad one skipped), got %', n; end if;
  if exists (select 1 from public.project_tasks where project_id = pr.id and (owner_id is not null or due is null)) then
    raise exception 'FAIL: class tasks start with no owner and a due date';
  end if;
  perform set_config('rls_test.pod', pod::text, true);
end $$;

-- B joins the same team: no second project.
reset role;
insert into public.pairing_members (pairing_id, user_id)
values (current_setting('rls_test.pod')::uuid, '00000000-0000-4000-8000-0000000029b2');
do $$
begin
  if (select count(*) from public.projects where pairing_id = current_setting('rls_test.pod')::uuid) <> 1 then
    raise exception 'FAIL: a second member must not start a second project';
  end if;
end $$;

-- As X (not in the class): can't read it.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000029f6","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.class_projects) then
    raise exception 'FAIL: someone outside the class must not read its class project';
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
