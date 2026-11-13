-- =============================================================================
-- rls_task_done_at.sql — tests for 0044 (when a task was finished)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, pod F1, project P1
--   C    — class K, pod F2 (a classmate, not a teammate)
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000044a1', 'rls-test-dna@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000044b2', 'rls-test-dnb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000044c3', 'rls-test-dnc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000044e5', 'rls-test-dno@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000044c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000044e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000044a1', '00000000-0000-4000-8000-00000044c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000044b2', '00000000-0000-4000-8000-00000044c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000044c3', '00000000-0000-4000-8000-00000044c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000044e5', '00000000-0000-4000-8000-00000044c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000044f1', '00000000-0000-4000-8000-00000044c1a5'),
  ('00000000-0000-4000-8000-0000000044f2', '00000000-0000-4000-8000-00000044c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000044f1', '00000000-0000-4000-8000-0000000044a1'),
  ('00000000-0000-4000-8000-0000000044f1', '00000000-0000-4000-8000-0000000044b2'),
  ('00000000-0000-4000-8000-0000000044f2', '00000000-0000-4000-8000-0000000044c3');

insert into public.projects (id, pairing_id, title) values
  ('00000000-0000-4000-8000-00000044a0b1', '00000000-0000-4000-8000-0000000044f1', 'P1');

-- A task made already done gets a time; one made open has none.
insert into public.project_tasks (id, project_id, title, owner_id, status) values
  ('00000000-0000-4000-8000-0000000044d1', '00000000-0000-4000-8000-00000044a0b1', 'T1', '00000000-0000-4000-8000-0000000044a1', 'todo'),
  ('00000000-0000-4000-8000-0000000044d2', '00000000-0000-4000-8000-00000044a0b1', 'T2', '00000000-0000-4000-8000-0000000044b2', 'done');
do $$
begin
  if (select done_at from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d1') is not null then
    raise exception 'FAIL: an open task must have no done_at';
  end if;
  if (select done_at from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d2') is null then
    raise exception 'FAIL: a task inserted as done should be stamped';
  end if;
end $$;

-- =============================================================================
-- As A: finishing stamps the server's time; reopening clears it; a client
-- can't set or move it
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000044a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  stamped timestamptz;
begin
  -- A forged time on an open task is dropped.
  update public.project_tasks set done_at = now() - interval '9 days'
  where id = '00000000-0000-4000-8000-0000000044d1';
  if (select done_at from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d1') is not null then
    raise exception 'FAIL: a client must not set done_at on an open task';
  end if;

  -- Finishing with a forged time: the server's clock wins.
  update public.project_tasks set status = 'done', done_at = now() - interval '9 days'
  where id = '00000000-0000-4000-8000-0000000044d1';
  select done_at into stamped from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d1';
  if stamped is null or stamped < now() - interval '1 minute' then
    raise exception 'FAIL: finishing should stamp the server''s time, got %', stamped;
  end if;

  -- Another edit (the title) keeps the time; so does trying to move it.
  update public.project_tasks set title = 'T1 renamed', done_at = now() - interval '9 days'
  where id = '00000000-0000-4000-8000-0000000044d1';
  if (select done_at from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d1') is distinct from stamped then
    raise exception 'FAIL: done_at must not move while the task stays done';
  end if;

  -- Reopening clears it.
  update public.project_tasks set status = 'doing' where id = '00000000-0000-4000-8000-0000000044d1';
  if (select done_at from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d1') is not null then
    raise exception 'FAIL: reopening a task should clear done_at';
  end if;
  update public.project_tasks set status = 'done' where id = '00000000-0000-4000-8000-0000000044d1';
end $$;
reset role;

-- =============================================================================
-- As B (teammate): reads it with the task. As C (another team): nothing.
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000044b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.project_tasks where done_at is not null) <> 2 then
    raise exception 'FAIL: B should read when the team''s tasks were finished';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000044c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.project_tasks where project_id = '00000000-0000-4000-8000-00000044a0b1') <> 0 then
    raise exception 'FAIL: C must not read another team''s tasks or their times';
  end if;
end $$;
reset role;

-- =============================================================================
-- A finished project stays read-only, and unassigning a leaver's task still
-- works with the new column (0033's guard compares the whole row)
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000044a1","role":"authenticated"}', true);
set local role authenticated;
select public.finish_project('00000000-0000-4000-8000-00000044a0b1');
do $$
begin
  begin
    update public.project_tasks set status = 'doing' where id = '00000000-0000-4000-8000-0000000044d1';
    raise exception 'FAIL: a finished project''s task must not be reopened';
  exception when sqlstate 'SP016' then null;
  end;
  update public.project_tasks set owner_id = null where id = '00000000-0000-4000-8000-0000000044d1';
  if (select done_at from public.project_tasks where id = '00000000-0000-4000-8000-0000000044d1') is null then
    raise exception 'FAIL: unassigning must keep done_at';
  end if;
end $$;
reset role;

select 'all RLS tests passed' as result;

rollback;
