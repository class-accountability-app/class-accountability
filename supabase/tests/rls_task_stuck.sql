-- =============================================================================
-- rls_task_stuck.sql — tests for 0047 (「困っています」 on a task)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): A, B teammates in team F (project J, task T owned
-- by A); X a classmate in no team.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000047a1', 'rls-test-sa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000047b2', 'rls-test-sb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000047e5', 'rls-test-so@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000047f6', 'rls-test-sx@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000047c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000047e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000047a1', '00000000-0000-4000-8000-00000047c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000047b2', '00000000-0000-4000-8000-00000047c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000047f6', '00000000-0000-4000-8000-00000047c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000047e5', '00000000-0000-4000-8000-00000047c1a5', 'organizer')
on conflict (user_id, class_id) do nothing;

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000047f1', '00000000-0000-4000-8000-00000047c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000047f1', '00000000-0000-4000-8000-0000000047a1'),
  ('00000000-0000-4000-8000-0000000047f1', '00000000-0000-4000-8000-0000000047b2');
insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000470001', '00000000-0000-4000-8000-0000000047f1', 'J',
   '00000000-0000-4000-8000-0000000047a1');
-- A new task is never stuck, whatever the insert says.
insert into public.project_tasks (id, project_id, title, owner_id, metric, status, stuck_note, stuck_at) values
  ('00000000-0000-4000-8000-000000470101', '00000000-0000-4000-8000-000000470001', 'T',
   '00000000-0000-4000-8000-0000000047a1', 'status', 'doing', 'forged', '2020-01-01');
do $$
begin
  if exists (select 1 from public.project_tasks
             where id = '00000000-0000-4000-8000-000000470101' and (stuck_note is not null or stuck_at is not null)) then
    raise exception 'FAIL: a new task must not start stuck';
  end if;
end $$;

-- As A (the owner): raises it; the server stamps the time; too long is refused.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000047a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  update public.project_tasks set stuck_note = '参考文献が見つかりません', stuck_at = '2020-01-01'
  where id = '00000000-0000-4000-8000-000000470101';
  select stuck_note, stuck_at into r from public.project_tasks where id = '00000000-0000-4000-8000-000000470101';
  if r.stuck_note is null or r.stuck_at < now() - interval '1 minute' then
    raise exception 'FAIL: the owner should raise the flag, with the server''s time: %', r;
  end if;
  begin
    update public.project_tasks set stuck_note = repeat('あ', 81) where id = '00000000-0000-4000-8000-000000470101';
    raise exception 'FAIL: a note over 80 characters must be refused';
  exception when check_violation then null;
  end;
end $$;

-- As B (a teammate): reads it, can't change or clear it, can still edit the task.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000047b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.project_tasks
                 where id = '00000000-0000-4000-8000-000000470101' and stuck_note = '参考文献が見つかりません') then
    raise exception 'FAIL: a teammate should read the stuck note';
  end if;
  begin
    update public.project_tasks set stuck_note = null where id = '00000000-0000-4000-8000-000000470101';
    raise exception 'FAIL: a teammate must not clear the owner''s flag';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.project_tasks set stuck_note = 'speaking for A' where id = '00000000-0000-4000-8000-000000470101';
    raise exception 'FAIL: a teammate must not write the owner''s note';
  exception when insufficient_privilege then null;
  end;
  update public.project_tasks set title = 'T2' where id = '00000000-0000-4000-8000-000000470101';
  if not exists (select 1 from public.project_tasks
                 where id = '00000000-0000-4000-8000-000000470101' and title = 'T2' and stuck_note is not null) then
    raise exception 'FAIL: a teammate''s other edits must keep the flag';
  end if;
end $$;

-- As X (a classmate outside the team) and the organizer: nothing.
do $$
declare
  u text;
begin
  foreach u in array array['00000000-0000-4000-8000-0000000047f6', '00000000-0000-4000-8000-0000000047e5'] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', u), true);
    if exists (select 1 from public.project_tasks where id = '00000000-0000-4000-8000-000000470101') then
      raise exception 'FAIL: % must not read the team''s task or its note', u;
    end if;
  end loop;
end $$;

-- As A: handing the task over clears it; raising it again and finishing clears it.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000047a1","role":"authenticated"}', true);
do $$
begin
  update public.project_tasks set owner_id = '00000000-0000-4000-8000-0000000047b2'
  where id = '00000000-0000-4000-8000-000000470101';
  if exists (select 1 from public.project_tasks
             where id = '00000000-0000-4000-8000-000000470101' and (stuck_note is not null or stuck_at is not null)) then
    raise exception 'FAIL: a new owner must not inherit the flag';
  end if;
  begin
    update public.project_tasks set stuck_note = 'not mine any more' where id = '00000000-0000-4000-8000-000000470101';
    raise exception 'FAIL: the former owner must not flag the task';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000047b2","role":"authenticated"}', true);
do $$
begin
  update public.project_tasks set stuck_note = 'B is stuck' where id = '00000000-0000-4000-8000-000000470101';
  update public.project_tasks set status = 'done' where id = '00000000-0000-4000-8000-000000470101';
  if exists (select 1 from public.project_tasks
             where id = '00000000-0000-4000-8000-000000470101' and stuck_note is not null) then
    raise exception 'FAIL: finishing a task must clear the flag';
  end if;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
