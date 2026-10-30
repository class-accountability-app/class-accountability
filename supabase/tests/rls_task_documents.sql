-- =============================================================================
-- rls_task_documents.sql — tests for 0030 (「Study Pods で書く」 on tasks)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): A and B in pod F (project P); O organizer.
--   T1: A's characters task, switched to document and written in.
--   T2: A's characters task with a manual log (can't become a document).
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000030a1', 'rls-test-wa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000030b2', 'rls-test-wb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000030e5', 'rls-test-wo@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000030c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000030e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000030a1', '00000000-0000-4000-8000-00000030c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000030b2', '00000000-0000-4000-8000-00000030c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000030e5', '00000000-0000-4000-8000-00000030c1a5', 'organizer')
on conflict (user_id, class_id) do nothing;

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000030f1', '00000000-0000-4000-8000-00000030c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000030f1', '00000000-0000-4000-8000-0000000030a1'),
  ('00000000-0000-4000-8000-0000000030f1', '00000000-0000-4000-8000-0000000030b2');

insert into public.projects (id, pairing_id, title, created_by)
select '00000000-0000-4000-8000-000000300001', '00000000-0000-4000-8000-0000000030f1', 'P',
       '00000000-0000-4000-8000-0000000030a1'
where not exists (select 1 from public.projects where pairing_id = '00000000-0000-4000-8000-0000000030f1');

insert into public.project_tasks (id, project_id, title, owner_id, metric, target_amount)
select x.id::uuid, pr.id, x.title, '00000000-0000-4000-8000-0000000030a1', 'characters', 3000
from public.projects pr,
     (values ('00000000-0000-4000-8000-000000300101', 'Script'),
             ('00000000-0000-4000-8000-000000300102', 'Notes')) as x(id, title)
where pr.pairing_id = '00000000-0000-4000-8000-0000000030f1';

-- =============================================================================
-- As A (owner)
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000030a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000300101';
  t2 constant uuid := '00000000-0000-4000-8000-000000300102';
  r record;
  n numeric;
begin
  -- T2 gets a manual log, then can't become a document.
  insert into public.task_progress (task_id, user_id, progress_value) values (t2, auth.uid(), 100);
  begin
    update public.project_tasks set input_mode = 'document' where id = t2;
    raise exception 'FAIL: a task with progress must not become a document';
  exception when sqlstate 'SP006' then null;
  end;

  -- T1 becomes a document; saving logs the count.
  update public.project_tasks set input_mode = 'document' where id = t1;
  select * into r from public.save_task_document(t1, 0, '{"type":"doc","content":[{"type":"paragraph"}]}', 120);
  if r.status <> 'saved' or r.version <> 1 then raise exception 'FAIL: first save gave %', r; end if;
  select * into r from public.save_task_document(t1, 1, '{"type":"doc","content":[{"type":"paragraph"}]}', 90);
  select sum(progress_value) into n from public.task_progress where task_id = t1;
  if n is distinct from 90 then raise exception 'FAIL: logged total should equal the count (90), got %', n; end if;

  -- A stale version is a conflict, nothing written.
  select * into r from public.save_task_document(t1, 0, '{"type":"doc","content":[]}', 5);
  if r.status <> 'conflict' or r.char_count <> 90 then raise exception 'FAIL: stale save should conflict, got %', r; end if;

  -- Too long.
  begin
    perform public.save_task_document(t1, 2, '{"type":"doc"}', 100001);
    raise exception 'FAIL: over 100,000 characters must be refused';
  exception when sqlstate 'SP005' then null;
  end;

  -- ＋記録 on a document task, and going back with text: refused.
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t1, auth.uid(), 10);
    raise exception 'FAIL: manual progress on a document task must be refused';
  exception when sqlstate 'SP007' then null;
  end;
  begin
    update public.project_tasks set input_mode = 'manual' where id = t1;
    raise exception 'FAIL: a document with text must not go back to manual';
  exception when sqlstate 'SP006' then null;
  end;

  perform public.keep_task_document_version(t1, '{"type":"doc","content":[]}', 3);
  if (select count(*) from public.task_document_versions where task_id = t1) < 2 then
    raise exception 'FAIL: versions should be kept';
  end if;
end $$;

-- =============================================================================
-- As B (teammate): sees the count, never the text; can't write it
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000030b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000300101';
  n numeric;
begin
  if exists (select 1 from public.task_documents) or exists (select 1 from public.task_document_versions) then
    raise exception 'FAIL: a teammate must not read the text or its versions';
  end if;
  select total into n from public.project_task_totals('00000000-0000-4000-8000-000000300001') where task_id = t1;
  if n is distinct from 90 then raise exception 'FAIL: a teammate should see the count (90), got %', n; end if;
  begin
    perform public.save_task_document(t1, 2, '{"type":"doc"}', 1);
    raise exception 'FAIL: a teammate must not save someone else''s task';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.keep_task_document_version(t1, '{"type":"doc"}', 1);
    raise exception 'FAIL: a teammate must not add versions';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The task is handed to B: B still can't read or overwrite A's text.
reset role;
update public.project_tasks set owner_id = '00000000-0000-4000-8000-0000000030b2'
where id = '00000000-0000-4000-8000-000000300101';
set local role authenticated;
do $$
begin
  if exists (select 1 from public.task_documents) then
    raise exception 'FAIL: a new owner must not read the previous writer''s text';
  end if;
  perform public.save_task_document('00000000-0000-4000-8000-000000300101', 2, '{"type":"doc"}', 1);
  raise exception 'FAIL: a new owner must not overwrite the previous writer''s text';
exception when insufficient_privilege then null;
end $$;

-- =============================================================================
-- As O (organizer) and logged out: nothing
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000030e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.task_documents) or exists (select 1 from public.task_document_versions) then
    raise exception 'FAIL: an organizer must not read task documents';
  end if;
end $$;

reset role;
set local role anon;
do $$
begin
  perform 1 from public.task_documents;
  raise exception 'FAIL: anon must not read task_documents';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
