-- =============================================================================
-- rls_documents.sql — RLS tests for 0019 (「Study Pods で書く」: documents,
-- versions, and document progress)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class,
-- a pod and targets, impersonates each user the way PostgREST does (role +
-- JWT claims), and checks what the database allows. Nothing it writes
-- survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — students in class K, same pod P
--   C    — student in class K, not in the pod
--   O    — K's organizer
--   D    — student in class K with a document, who deletes their account
--   A owns TD (a document target) and TM (a manual character_count target).
--
-- How to run: see "RLS tests" in CLAUDE.md.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000019a1', 'rls-test-da@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000019b2', 'rls-test-db@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000019c3', 'rls-test-dc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000019d4', 'rls-test-dd@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000019e5', 'rls-test-do@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000019c1a5', 'RLS test class K (documents)', 'Test', 'test',
   '00000000-0000-4000-8000-0000000019e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-00000019c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000019b2', '00000000-0000-4000-8000-00000019c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000019c3', '00000000-0000-4000-8000-00000019c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000019d4', '00000000-0000-4000-8000-00000019c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000019e5', '00000000-0000-4000-8000-00000019c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000019f1', '00000000-0000-4000-8000-00000019c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000019f1', '00000000-0000-4000-8000-0000000019a1'),
  ('00000000-0000-4000-8000-0000000019f1', '00000000-0000-4000-8000-0000000019b2');

insert into public.targets (id, user_id, class_id, title, target_type, target_amount, input_mode) values
  ('00000000-0000-4000-8000-0000001900d1', '00000000-0000-4000-8000-0000000019a1',
   '00000000-0000-4000-8000-00000019c1a5', 'TD', 'character_count', 2000, 'document'),
  ('00000000-0000-4000-8000-0000001900a2', '00000000-0000-4000-8000-0000000019a1',
   '00000000-0000-4000-8000-00000019c1a5', 'TM', 'character_count', 2000, 'manual'),
  ('00000000-0000-4000-8000-0000001900d4', '00000000-0000-4000-8000-0000000019d4',
   '00000000-0000-4000-8000-00000019c1a5', 'DD', 'character_count', 1000, 'document');

insert into public.progress_logs (user_id, target_id, progress_value) values
  ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-0000001900a2', 300);

do $$
begin
  -- Only character_count targets can be documents.
  begin
    insert into public.targets (user_id, class_id, title, target_type, target_amount, input_mode) values
      ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-00000019c1a5',
       'hours doc', 'study_hours', 10, 'document');
    raise exception 'FAIL: a study_hours target became a document';
  exception when check_violation then null;
  end;
end $$;


-- =============================================================================
-- As A (owner of TD and TM; podmate of B)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  td  constant uuid := '00000000-0000-4000-8000-0000001900d1';
  tm  constant uuid := '00000000-0000-4000-8000-0000001900a2';
  dd  constant uuid := '00000000-0000-4000-8000-0000001900d4';
  a   constant uuid := '00000000-0000-4000-8000-0000000019a1';
  doc1 constant jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"一"}]}]}';
  r record;
  n integer;
  total numeric;
begin
  -- --- saving: text, count, version and progress move together --------------
  select * into r from public.save_document(td, 0, doc1, 120);
  if r.status <> 'saved' or r.version <> 1 or r.char_count <> 120 then
    raise exception 'FAIL: first save: % v% %', r.status, r.version, r.char_count;
  end if;

  select * into r from public.save_document(td, 1, doc1, 80);
  if r.status <> 'saved' or r.version <> 2 then
    raise exception 'FAIL: second save: % v%', r.status, r.version;
  end if;

  select coalesce(sum(progress_value), 0), count(*) into total, n
  from public.progress_logs where target_id = td;
  if total <> 80 or n <> 1 then
    raise exception 'FAIL: deleting text should lower the logged total to 80 in one session row (got %, % rows)', total, n;
  end if;
  if (select count(*) from public.document_versions where target_id = td) <> 1 then
    raise exception 'FAIL: two saves within 10 minutes should make one autosave version';
  end if;

  -- --- two devices: a stale version writes nothing ---------------------------
  select * into r from public.save_document(td, 1, doc1, 999);
  if r.status <> 'conflict' or r.version <> 2 or r.char_count <> 80 then
    raise exception 'FAIL: a stale save was not refused as a conflict';
  end if;
  if (select char_count from public.documents where target_id = td) <> 80 then
    raise exception 'FAIL: a conflicting save changed the document';
  end if;

  -- Keeping mine over theirs (or restoring): what's saved becomes a version.
  select * into r from public.save_document(td, 2, doc1, 200, 'before_restore');
  if r.status <> 'saved' or (select count(*) from public.document_versions
                             where target_id = td and reason = 'before_restore' and char_count = 80) <> 1 then
    raise exception 'FAIL: before_restore did not keep the current text as a version';
  end if;
  perform public.keep_document_version(td, doc1, 55);
  if (select count(*) from public.document_versions where target_id = td and reason = 'conflict') <> 1 then
    raise exception 'FAIL: keep_document_version did not add a conflict version';
  end if;

  begin
    perform public.save_document(td, 3, doc1, 200, 'whatever');
    raise exception 'FAIL: an unknown version reason was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- --- size limits --------------------------------------------------------------
  begin
    perform public.save_document(td, 3, doc1, 100001);
    raise exception 'FAIL: 100,001 characters were saved';
  exception when sqlstate 'SP005' then null;
  end;
  begin
    perform public.save_document(td, 3,
      jsonb_build_object('type', 'doc', 'pad', repeat('x', 1000001)), 10);
    raise exception 'FAIL: over 1,000,000 bytes of JSON were saved';
  exception when sqlstate 'SP005' then null;
  end;
  begin
    perform public.keep_document_version(td, doc1, 100001);
    raise exception 'FAIL: keep_document_version took 100,001 characters';
  exception when sqlstate 'SP005' then null;
  end;
  select * into r from public.save_document(td, 3, doc1, 100000);
  if r.status <> 'saved' then
    raise exception 'FAIL: exactly 100,000 characters should save';
  end if;
  select * into r from public.save_document(td, 4, doc1, 200);

  -- --- the owner reads their own rows ---------------------------------------------
  if (select count(*) from public.documents where target_id = td) <> 1
     or (select count(*) from public.document_versions where target_id = td) < 3 then
    raise exception 'FAIL: A could not read their own document and versions';
  end if;

  -- --- no direct writes to documents or versions ---------------------------------
  begin
    insert into public.documents (target_id, user_id, content) values (tm, a, '{}');
    raise exception 'FAIL: A inserted a document directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.documents set char_count = 5 where target_id = td;
    raise exception 'FAIL: A updated a document directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.documents where target_id = td;
    raise exception 'FAIL: A deleted a document directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.document_versions (target_id, user_id, content, char_count, reason)
    values (td, a, '{}', 1, 'autosave');
    raise exception 'FAIL: A inserted a version directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.document_versions where target_id = td;
    raise exception 'FAIL: A deleted versions directly';
  exception when insufficient_privilege then null;
  end;

  -- --- 'document' progress rows: no insert, update or direct delete --------------
  begin
    insert into public.progress_logs (user_id, target_id, source, progress_value)
    values (a, td, 'document', 500);
    raise exception 'FAIL: A inserted a document progress row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.progress_logs (user_id, target_id, progress_value) values (a, td, 500);
    raise exception 'FAIL: A logged manually on a document target';
  exception when sqlstate 'SP007' then null;
  end;
  begin
    update public.progress_logs set progress_value = 5000 where target_id = td and source = 'document';
    raise exception 'FAIL: A edited a document progress row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.progress_logs where target_id = td and source = 'document';
    raise exception 'FAIL: A deleted a document progress row directly';
  exception when insufficient_privilege then null;
  end;
  if (select sum(progress_value) from public.progress_logs where target_id = td) <> 200 then
    raise exception 'FAIL: the logged total no longer equals the count';
  end if;

  -- --- manual logs keep every 0014 rule -------------------------------------------
  insert into public.progress_logs (user_id, target_id, progress_value) values (a, tm, 40);
  begin
    insert into public.progress_logs (user_id, target_id, progress_value) values (a, tm, 0);
    raise exception 'FAIL: a manual log of 0 was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress_logs (user_id, target_id, progress_value) values (a, tm, -10);
    raise exception 'FAIL: a negative manual log was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress_logs (user_id, target_id, source, progress_value) values (a, tm, 'google_docs', 10);
    raise exception 'FAIL: a student inserted a non-manual log';
  exception when insufficient_privilege then null;
  end;

  -- --- the mode can't change once there's text or there are logs ------------------
  begin
    update public.targets set input_mode = 'manual' where id = td;
    raise exception 'FAIL: a document with text went back to manual';
  exception when sqlstate 'SP006' then null;
  end;
  begin
    update public.targets set input_mode = 'document' where id = tm;
    raise exception 'FAIL: a target with logs became a document';
  exception when sqlstate 'SP006' then null;
  end;

  -- --- only my own document targets -----------------------------------------------
  begin
    perform public.save_document(tm, 0, doc1, 10);
    raise exception 'FAIL: save_document wrote to a manual target';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_document(dd, 0, doc1, 10);
    raise exception 'FAIL: A saved into D''s document';
  exception when insufficient_privilege then null;
  end;
end $$;


-- =============================================================================
-- As B (A's podmate): the count, never the text
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  td  constant uuid := '00000000-0000-4000-8000-0000001900d1';
  doc1 constant jsonb := '{"type":"doc","content":[]}';
begin
  if (select count(*) from public.documents) <> 0 then
    raise exception 'FAIL: a podmate can read a document';
  end if;
  if (select count(*) from public.document_versions) <> 0 then
    raise exception 'FAIL: a podmate can read a document''s versions';
  end if;
  if (select sum(progress_value) from public.progress_logs where target_id = td) <> 200 then
    raise exception 'FAIL: a podmate should see the document''s count through progress_logs';
  end if;
  begin
    perform public.save_document(td, 6, doc1, 1);
    raise exception 'FAIL: a podmate saved into A''s document';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.keep_document_version(td, doc1, 1);
    raise exception 'FAIL: a podmate added a version to A''s document';
  exception when insufficient_privilege then null;
  end;
end $$;


-- =============================================================================
-- As C (classmate, not in the pod) and O (the organizer)
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019c3","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.documents) + (select count(*) from public.document_versions) <> 0 then
    raise exception 'FAIL: a classmate outside the pod can read documents or versions';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019e5","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.documents) + (select count(*) from public.document_versions) <> 0 then
    raise exception 'FAIL: the organizer can read documents or versions';
  end if;
  if exists (select 1 from public.progress_logs where target_id = '00000000-0000-4000-8000-0000001900d1') then
    raise exception 'FAIL: the organizer can see a student''s document progress';
  end if;
end $$;


-- =============================================================================
-- Logged out
-- =============================================================================

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  begin
    perform 1 from public.documents;
    raise exception 'FAIL: anon can read documents';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.document_versions;
    raise exception 'FAIL: anon can read document versions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_document('00000000-0000-4000-8000-0000001900d1', 0, '{}', 1);
    raise exception 'FAIL: anon can call save_document';
  exception when insufficient_privilege then null;
  end;
end $$;


-- =============================================================================
-- Deleting: the target (as A), then D's account
-- =============================================================================

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019d4","role":"authenticated"}', true);
set local role authenticated;

-- D writes something first, so there is a document, a version and a log.
select * from public.save_document('00000000-0000-4000-8000-0000001900d4', 0,
  '{"type":"doc","content":[]}', 42);

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  td constant uuid := '00000000-0000-4000-8000-0000001900d1';
  n integer;
begin
  delete from public.targets where id = td;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: A could not delete their own document target';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000019d4","role":"authenticated"}', true);
set local role authenticated;

select public.delete_my_account();

reset role;

do $$
begin
  if exists (select 1 from public.documents where target_id = '00000000-0000-4000-8000-0000001900d1')
     or exists (select 1 from public.document_versions where target_id = '00000000-0000-4000-8000-0000001900d1')
     or exists (select 1 from public.progress_logs where target_id = '00000000-0000-4000-8000-0000001900d1') then
    raise exception 'FAIL: deleting the target left its document, versions or logs';
  end if;
  if exists (select 1 from public.documents where user_id = '00000000-0000-4000-8000-0000000019d4')
     or exists (select 1 from public.document_versions where user_id = '00000000-0000-4000-8000-0000000019d4')
     or exists (select 1 from public.progress_logs where user_id = '00000000-0000-4000-8000-0000000019d4')
     or exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000019d4') then
    raise exception 'FAIL: delete_my_account left the document, versions, logs or the user';
  end if;
  -- A's manual target is untouched.
  if (select sum(progress_value) from public.progress_logs where target_id = '00000000-0000-4000-8000-0000001900a2') <> 340 then
    raise exception 'FAIL: A''s manual target lost logs';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
