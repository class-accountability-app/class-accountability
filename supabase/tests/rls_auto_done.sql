-- =============================================================================
-- rls_auto_done.sql — tests for 0054 (done as soon as the target is reached)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): A, B teammates in team F (project J); A owns
-- T1 (count, target 10), T2 (count, no target) and T3 (characters, target 100);
-- B owns T4 (count, target 5).
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000054a1', 'rls-test-ada@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000054b2', 'rls-test-adb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000054e5', 'rls-test-ado@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000054c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000054e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000054a1', '00000000-0000-4000-8000-00000054c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000054b2', '00000000-0000-4000-8000-00000054c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000054e5', '00000000-0000-4000-8000-00000054c1a5', 'organizer')
on conflict (user_id, class_id) do nothing;

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000054f1', '00000000-0000-4000-8000-00000054c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000054f1', '00000000-0000-4000-8000-0000000054a1'),
  ('00000000-0000-4000-8000-0000000054f1', '00000000-0000-4000-8000-0000000054b2');
insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000540001', '00000000-0000-4000-8000-0000000054f1', 'J',
   '00000000-0000-4000-8000-0000000054a1');
insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount, status) values
  ('00000000-0000-4000-8000-000000540101', '00000000-0000-4000-8000-000000540001', 'T1',
   '00000000-0000-4000-8000-0000000054a1', 'count', 'slides', 10, 'todo'),
  ('00000000-0000-4000-8000-000000540102', '00000000-0000-4000-8000-000000540001', 'T2',
   '00000000-0000-4000-8000-0000000054a1', 'count', 'slides', null, 'todo'),
  ('00000000-0000-4000-8000-000000540103', '00000000-0000-4000-8000-000000540001', 'T3',
   '00000000-0000-4000-8000-0000000054a1', 'characters', null, 100, 'doing'),
  ('00000000-0000-4000-8000-000000540104', '00000000-0000-4000-8000-000000540001', 'T4',
   '00000000-0000-4000-8000-0000000054b2', 'count', 'slides', 5, 'todo');

-- The trigger runs the new function, and the Google-only one is gone.
do $$
begin
  if not exists (select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
                 where tg.tgname = 'task_progress_auto_done' and p.proname = 'auto_done_on_target') then
    raise exception 'FAIL: task_progress_auto_done should call private.auto_done_on_target';
  end if;
  if exists (select 1 from pg_proc where proname = 'auto_done_from_google') then
    raise exception 'FAIL: the Google-only auto-done function should be dropped';
  end if;
end $$;

-- As A: entries by hand.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000054a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000054a1';
  t1 constant uuid := '00000000-0000-4000-8000-000000540101';
  t2 constant uuid := '00000000-0000-4000-8000-000000540102';
  t3 constant uuid := '00000000-0000-4000-8000-000000540103';
begin
  -- Below the target: not done.
  insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
  values (t1, a, 4, gen_random_uuid(), 'manual');
  if (select status from public.project_tasks where id = t1) = 'done' then
    raise exception 'FAIL: 4 of 10 must not be done';
  end if;

  -- Reaching it exactly: done, with done_at stamped (0044).
  insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
  values (t1, a, 6, gen_random_uuid(), 'manual');
  if (select status from public.project_tasks where id = t1) <> 'done'
     or (select done_at from public.project_tasks where id = t1) is null then
    raise exception 'FAIL: 10 of 10 by hand should be done, with done_at';
  end if;

  -- More after done: still done, no error.
  insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
  values (t1, a, 3, gen_random_uuid(), 'manual');
  if (select status from public.project_tasks where id = t1) <> 'done' then
    raise exception 'FAIL: a done task should stay done';
  end if;

  -- No target: never done automatically.
  insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
  values (t2, a, 500, gen_random_uuid(), 'manual');
  if (select status from public.project_tasks where id = t2) = 'done' then
    raise exception 'FAIL: a task without a target must not become done';
  end if;

  -- Characters by hand, passing the target in one entry.
  insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
  values (t3, a, 120, gen_random_uuid(), 'manual');
  if (select status from public.project_tasks where id = t3) <> 'done' then
    raise exception 'FAIL: 120 of 100 characters should be done';
  end if;

  -- Reopened by hand, then another entry: reached again, so done again.
  update public.project_tasks set status = 'doing' where id = t1;
  insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
  values (t1, a, 1, gen_random_uuid(), 'manual');
  if (select status from public.project_tasks where id = t1) <> 'done' then
    raise exception 'FAIL: an entry on a reopened task over its target should mark it done again';
  end if;

  -- A can't log on B's task, so can't finish it either.
  begin
    insert into public.task_progress (task_id, user_id, progress_value, client_id, source)
    values ('00000000-0000-4000-8000-000000540104', a, 5, gen_random_uuid(), 'manual');
    raise exception 'FAIL: A must not log on B''s task';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  if (select status from public.project_tasks where id = '00000000-0000-4000-8000-000000540104') = 'done' then
    raise exception 'FAIL: B''s task must be untouched';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
