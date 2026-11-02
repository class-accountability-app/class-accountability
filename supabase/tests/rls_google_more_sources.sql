-- =============================================================================
-- rls_google_more_sources.sql — tests for 0040 (English words and Sheets rows)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): A in class K, team F, project P, Google connected.
-- Tasks: tw Essay (A, count, words, goal 100), ts Survey (A, count, answers,
-- goal 20), tc Script (A, characters).
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000040a1', 'rls-test-ga@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000040e5', 'rls-test-go@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000040c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000040e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-00000040c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000040e5', '00000000-0000-4000-8000-00000040c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000040f1', '00000000-0000-4000-8000-00000040c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000040f1', '00000000-0000-4000-8000-0000000040a1');

insert into public.projects (id, pairing_id, title) values
  ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-0000000040f1', 'P');

insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount) values
  ('00000000-0000-4000-8000-0000000040d1', '00000000-0000-4000-8000-000000400001', 'Essay',
   '00000000-0000-4000-8000-0000000040a1', 'count', 'words', 100),
  ('00000000-0000-4000-8000-0000000040d2', '00000000-0000-4000-8000-000000400001', 'Survey',
   '00000000-0000-4000-8000-0000000040a1', 'count', 'answers', 20),
  ('00000000-0000-4000-8000-0000000040d3', '00000000-0000-4000-8000-000000400001', 'Script',
   '00000000-0000-4000-8000-0000000040a1', 'characters', null, null);

set local role service_role;
select public.save_google_credentials('00000000-0000-4000-8000-0000000040a1', 'ciphertext-a', 'sub-a');
reset role;

-- =============================================================================
-- As A: link a Doc for words and a Sheet for rows; kinds must fit the metric
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000040a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.link_task_source('00000000-0000-4000-8000-0000000040d1', 'doc_words', 'DocFileId_0001', 'Essay');
  perform public.link_task_source('00000000-0000-4000-8000-0000000040d2', 'sheet', 'SheetFileId_001', 'Answers');
  if (select source from public.project_tasks where id = '00000000-0000-4000-8000-0000000040d1') <> 'google_docs'
     or (select source from public.project_tasks where id = '00000000-0000-4000-8000-0000000040d2') <> 'google_sheets' then
    raise exception 'FAIL: words log as google_docs, rows as google_sheets';
  end if;

  begin
    perform public.link_task_source('00000000-0000-4000-8000-0000000040d3', 'sheet', 'SheetFileId_002', 'x');
    raise exception 'FAIL: a sheet must not count a characters task';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    perform public.link_task_source('00000000-0000-4000-8000-0000000040d3', 'doc_words', 'DocFileId_0002', 'x');
    raise exception 'FAIL: words must not count a characters task';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    perform public.link_task_source('00000000-0000-4000-8000-0000000040d1', 'doc', 'DocFileId_0003', 'x');
    raise exception 'FAIL: a characters Doc must not count a count task';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    update public.project_tasks set source = 'google_sheets' where id = '00000000-0000-4000-8000-0000000040d3';
    raise exception 'FAIL: a client must not set a Google source itself';
  exception when sqlstate 'SP011' then null;
  end;
end $$;

-- =============================================================================
-- As service_role (the Edge Function): counts go up and down, auto-done
-- =============================================================================
reset role;
set local role service_role;
do $$
begin
  perform public.record_synced_count('00000000-0000-4000-8000-0000000040d2', 12);
  perform public.record_synced_count('00000000-0000-4000-8000-0000000040d2', 10); -- two rows deleted
  if (select sum(progress_value) from public.task_progress where task_id = '00000000-0000-4000-8000-0000000040d2') <> 10 then
    raise exception 'FAIL: the sheet total should follow the row count';
  end if;
  if exists (select 1 from public.task_progress where task_id = '00000000-0000-4000-8000-0000000040d2' and source <> 'google_sheets') then
    raise exception 'FAIL: sheet entries should be google_sheets';
  end if;

  perform public.record_synced_count('00000000-0000-4000-8000-0000000040d2', 20);
  if (select status from public.project_tasks where id = '00000000-0000-4000-8000-0000000040d2') <> 'done' then
    raise exception 'FAIL: reaching 20 answers from a sheet should mark the task done';
  end if;

  perform public.record_synced_count('00000000-0000-4000-8000-0000000040d1', 60);
  if (select status from public.project_tasks where id = '00000000-0000-4000-8000-0000000040d1') = 'done' then
    raise exception 'FAIL: 60 of 100 words is not done';
  end if;
end $$;

-- A unlinks the sheet: back to manual, numbers kept.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000040a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.unlink_task_source('00000000-0000-4000-8000-0000000040d2');
  if (select source from public.project_tasks where id = '00000000-0000-4000-8000-0000000040d2') <> 'manual' then
    raise exception 'FAIL: unlinking a sheet should make the task manual again';
  end if;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
