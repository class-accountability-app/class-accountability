-- =============================================================================
-- rls_google_sources.sql — RLS tests for 0023 (Google credentials, task sources,
-- sync state, synced counts). Teammates never see a member's live count or
-- sync times: only the task's owner, through my_task_sync_status().
-- =============================================================================
-- ONE transaction that ends in ROLLBACK: it creates throwaway users, a class and
-- pods, impersonates each user the way PostgREST does (role + JWT claims), and
-- checks what the database allows. The Edge Function's calls are made as
-- service_role. Nothing it writes survives.
--
-- A failed check raises "FAIL: ..." and aborts; the whole run is rolled back.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all emails are @andrew.ac.jp, so the signup trigger accepts them):
--   A, B — class K, same pod F1, project P. A has Google connected; B hasn't.
--          Tasks: t1 Script (A, characters), t2 Slides (B, count),
--          t3 Notes (no owner, characters), t4 Rehearse (A, status)
--   C    — class K, alone in pod F2 (project Q); Google connected
--   O    — organizer of K (never in a pod); Google connected
--
-- How to run: see "RLS tests" in CLAUDE.md. Before and after, count auth.users,
-- profiles and nudges and confirm they match.
-- =============================================================================

begin;

-- --- Setup (as the table owner, so RLS doesn't apply) ------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000023a1', 'rls-test-sa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023b2', 'rls-test-sb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023c3', 'rls-test-sc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023e5', 'rls-test-so@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000023c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000023e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000023a1', '00000000-0000-4000-8000-00000023c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000023b2', '00000000-0000-4000-8000-00000023c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000023c3', '00000000-0000-4000-8000-00000023c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000023e5', '00000000-0000-4000-8000-00000023c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000023f1', '00000000-0000-4000-8000-00000023c1a5'),
  ('00000000-0000-4000-8000-0000000023f2', '00000000-0000-4000-8000-00000023c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000023f1', '00000000-0000-4000-8000-0000000023a1'),
  ('00000000-0000-4000-8000-0000000023f1', '00000000-0000-4000-8000-0000000023b2'),
  ('00000000-0000-4000-8000-0000000023f2', '00000000-0000-4000-8000-0000000023c3');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000230001', '00000000-0000-4000-8000-0000000023f1', 'Group talk',
   '00000000-0000-4000-8000-0000000023a1'),
  ('00000000-0000-4000-8000-000000230002', '00000000-0000-4000-8000-0000000023f2', 'Other group',
   '00000000-0000-4000-8000-0000000023c3');

insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount) values
  ('00000000-0000-4000-8000-000000230101', '00000000-0000-4000-8000-000000230001', 'Script',
   '00000000-0000-4000-8000-0000000023a1', 'characters', null, 2400),
  ('00000000-0000-4000-8000-000000230102', '00000000-0000-4000-8000-000000230001', 'Slides',
   '00000000-0000-4000-8000-0000000023b2', 'count', 'slides', 10),
  ('00000000-0000-4000-8000-000000230103', '00000000-0000-4000-8000-000000230001', 'Notes',
   null, 'characters', null, null),
  ('00000000-0000-4000-8000-000000230104', '00000000-0000-4000-8000-000000230001', 'Rehearse',
   '00000000-0000-4000-8000-0000000023a1', 'status', null, null);


-- =============================================================================
-- As service_role (the OAuth callback): store A's, C's and O's tokens
-- =============================================================================

set local role service_role;

do $$
begin
  perform public.save_google_credentials('00000000-0000-4000-8000-0000000023a1', 'ciphertext-a-old', 'sub-a');
  perform public.save_google_credentials('00000000-0000-4000-8000-0000000023a1', 'ciphertext-a', 'sub-a');
  perform public.save_google_credentials('00000000-0000-4000-8000-0000000023c3', 'ciphertext-c', 'sub-c');
  perform public.save_google_credentials('00000000-0000-4000-8000-0000000023e5', 'ciphertext-o', 'sub-o');

  -- Reconnecting replaces the row; the token is read back only through the function.
  if (select count(*) from public.get_google_credentials('00000000-0000-4000-8000-0000000023a1')
       where refresh_token_enc = 'ciphertext-a') <> 1 then
    raise exception 'FAIL: get_google_credentials did not return A''s newest token';
  end if;
  if exists (select 1 from public.get_google_credentials('00000000-0000-4000-8000-0000000023b2')) then
    raise exception 'FAIL: B has credentials without connecting';
  end if;

  -- Even service_role has no direct way into the table.
  begin
    perform 1 from private.google_credentials;
    raise exception 'FAIL: service_role read private.google_credentials directly';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As A (pod member, Google connected): links files; can't reach the server side
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a    constant uuid := '00000000-0000-4000-8000-0000000023a1';
  t1   constant uuid := '00000000-0000-4000-8000-000000230101';
  t2   constant uuid := '00000000-0000-4000-8000-000000230102';
  t3   constant uuid := '00000000-0000-4000-8000-000000230103';
  t4   constant uuid := '00000000-0000-4000-8000-000000230104';
  doc  constant text := '1DocFileAbCdEfGhIjKlMnOpQrStUvWx';
  sld  constant text := '1SlidesFileAbCdEfGhIjKlMnOpQr';
begin
  -- The server side is out of reach.
  begin
    perform 1 from private.google_credentials;
    raise exception 'FAIL: A read private.google_credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_google_credentials(a);
    raise exception 'FAIL: A called get_google_credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_google_credentials(a, 'forged', null);
    raise exception 'FAIL: A called save_google_credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_synced_count(t1, 100000);
    raise exception 'FAIL: A called record_synced_count';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_task_source_lost(t1);
    raise exception 'FAIL: A called mark_task_source_lost';
  exception when insufficient_privilege then null;
  end;

  -- No direct writes to task_sources.
  begin
    insert into public.task_sources (task_id, kind, file_id, label, linked_by)
    values (t1, 'doc', doc, 'direct', a);
    raise exception 'FAIL: A inserted a task source directly';
  exception when insufficient_privilege then null;
  end;

  -- A manual entry before linking: the link starts from this total.
  insert into public.task_progress (task_id, user_id, progress_value) values (t1, a, 50);

  -- The file must fit the task.
  begin
    perform public.link_task_source(t1, 'slides', sld, 'Deck');
    raise exception 'FAIL: Slides were linked to a characters task';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    perform public.link_task_source(t2, 'doc', doc, 'Doc');
    raise exception 'FAIL: a Doc was linked to a count task';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    perform public.link_task_source(t4, 'doc', doc, 'Doc');
    raise exception 'FAIL: a Doc was linked to a status task';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    perform public.link_task_source(t1, 'doc_section', doc, 'Intro');
    raise exception 'FAIL: a section was linked without a heading';
  exception when check_violation then null;
  end;
  begin
    perform public.link_task_source(t1, 'doc', doc, 'Doc', 'h.abc123');
    raise exception 'FAIL: a whole-Doc link kept a heading';
  exception when check_violation then null;
  end;
  begin
    perform public.link_task_source(t1, 'doc', 'not a file id!', 'Doc');
    raise exception 'FAIL: a malformed file id was saved';
  exception when check_violation then null;
  end;
  begin
    perform public.link_task_source(t1, 'doc', doc, '   ');
    raise exception 'FAIL: a blank label was saved';
  exception when check_violation then null;
  end;
  begin
    perform public.link_task_source(t1, 'doc', doc, repeat('x', 61));
    raise exception 'FAIL: a 61-character label was saved';
  exception when check_violation then null;
  end;

  -- My task's section of the group Doc; B's slides (any member links any task);
  -- the unowned notes.
  perform public.link_task_source(t1, 'doc_section', doc, '  Intro  ', 'h.abc123');
  perform public.link_task_source(t2, 'slides', sld, 'Deck');
  perform public.link_task_source(t3, 'doc', doc, 'Notes');

  if (select source from public.project_tasks where id = t1) <> 'google_docs'
     or (select source from public.project_tasks where id = t2) <> 'google_slides' then
    raise exception 'FAIL: linking did not set the task''s source';
  end if;
  if (select label from public.task_sources where task_id = t1) <> 'Intro' then
    raise exception 'FAIL: the label was not trimmed';
  end if;

  -- While linked: no ＋記録, no forged synced rows, no change of measure.
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t1, a, 10);
    raise exception 'FAIL: A logged by hand on a linked task';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value, source) values (t1, a, 10, 'google_docs');
    raise exception 'FAIL: A wrote a google_docs progress row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value, source) values (t4, a, 1, 'google_slides');
    raise exception 'FAIL: A wrote a google_slides progress row';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.project_tasks set source = 'manual' where id = t1;
    raise exception 'FAIL: A switched a linked task back to manual without unlinking';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    update public.project_tasks set input_mode = 'document' where id = t1;
    raise exception 'FAIL: A changed how a linked task is measured';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    update public.project_tasks set source = 'google_docs' where id = t4;
    raise exception 'FAIL: A gave a task a Google source without a link';
  exception when sqlstate 'SP011' then null;
  end;
  begin
    insert into public.project_tasks (project_id, title, source)
    values ('00000000-0000-4000-8000-000000230001', 'fake', 'google_slides');
    raise exception 'FAIL: A created a task with a Google source';
  exception when sqlstate 'SP011' then null;
  end;

  -- Members read the links; the sync's numbers are out of reach.
  if (select count(*) from public.task_sources) <> 3 then
    raise exception 'FAIL: A should see 3 task sources';
  end if;
  begin
    perform 1 from private.task_source_sync;
    raise exception 'FAIL: A read private.task_source_sync';
  exception when insufficient_privilege then null;
  end;
  if not public.has_google_connection() then
    raise exception 'FAIL: has_google_connection is false for A';
  end if;
end $$;

reset role;


-- =============================================================================
-- As service_role (the Edge Function): several syncs, up and down
-- =============================================================================

set local role service_role;

do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
  t2 constant uuid := '00000000-0000-4000-8000-000000230102';
  t3 constant uuid := '00000000-0000-4000-8000-000000230103';
  t4 constant uuid := '00000000-0000-4000-8000-000000230104';
begin
  -- The link started from A's manual 50, so the first sync logs 250, not 300.
  if public.record_synced_count(t1, 300) <> 250
     or public.record_synced_count(t1, 420) <> 120
     or public.record_synced_count(t1, 420) <> 0
     or public.record_synced_count(t1, 380) <> -40 then
    raise exception 'FAIL: record_synced_count logged the wrong differences on t1';
  end if;

  if public.record_synced_count(t2, 4) <> 4
     or public.record_synced_count(t2, 6) <> 2
     or public.record_synced_count(t2, 5) <> -1 then
    raise exception 'FAIL: record_synced_count logged the wrong differences on t2';
  end if;

  -- No owner: nothing logged, but the count moves.
  if public.record_synced_count(t3, 100) <> 0 then
    raise exception 'FAIL: a sync on an unowned task reported a logged difference';
  end if;

  -- An unlinked task: nothing to do.
  if public.record_synced_count(t4, 7) is not null then
    raise exception 'FAIL: a sync on an unlinked task did something';
  end if;

  begin
    perform public.record_synced_count(t1, -1);
    raise exception 'FAIL: a negative count was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Lost access, then a successful read brings it back.
  perform public.mark_task_source_lost(t2);
  if (select state from public.task_sources where task_id = t2) <> 'lost_access' then
    raise exception 'FAIL: mark_task_source_lost did not mark the source';
  end if;
  -- Two statements: a subquery in the same statement as the call would read
  -- the snapshot taken before the function ran.
  if public.record_synced_count(t2, 5) <> 0 then
    raise exception 'FAIL: an unchanged count logged a difference';
  end if;
  if (select state from public.task_sources where task_id = t2) <> 'ok' then
    raise exception 'FAIL: a successful sync did not clear lost_access';
  end if;

  -- The Edge Function reads sources, but writes them only through the functions.
  begin
    update public.task_sources set state = 'ok' where task_id = t1;
    raise exception 'FAIL: service_role updated task_sources directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.task_source_sync;
    raise exception 'FAIL: service_role read private.task_source_sync directly';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- The numbers, as the table owner.
do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
  t2 constant uuid := '00000000-0000-4000-8000-000000230102';
  t3 constant uuid := '00000000-0000-4000-8000-000000230103';
begin
  -- The task's total is the file's live count.
  if (select sum(progress_value) from public.task_progress where task_id = t1) <> 380
     or (select last_count from private.task_source_sync where task_id = t1) <> 380 then
    raise exception 'FAIL: t1''s total is not the live count of 380';
  end if;
  if (select count(*) from public.task_progress where task_id = t1 and source = 'google_docs'
        and user_id = '00000000-0000-4000-8000-0000000023a1') <> 3 then
    raise exception 'FAIL: t1 should have 3 google_docs rows in its owner''s name (no row for 0)';
  end if;
  if (select sum(progress_value) from public.task_progress where task_id = t2) <> 5
     or (select count(*) from public.task_progress where task_id = t2 and source = 'google_slides'
           and user_id = '00000000-0000-4000-8000-0000000023b2') <> 3 then
    raise exception 'FAIL: t2''s total is not the live count of 5 slides in B''s name';
  end if;
  if exists (select 1 from public.task_progress where task_id = t3)
     or (select last_count from private.task_source_sync where task_id = t3) <> 100 then
    raise exception 'FAIL: an unowned task got rows, or its count did not move';
  end if;
  if (select last_changed_at from private.task_source_sync where task_id = t1) is null
     or (select last_checked_at from private.task_source_sync where task_id = t1) is null then
    raise exception 'FAIL: last_checked_at / last_changed_at were not set';
  end if;
end $$;


-- =============================================================================
-- As A: my task's total is live; B's numbers stay B's; check-in shares it
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p  constant uuid := '00000000-0000-4000-8000-000000230001';
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
  t2 constant uuid := '00000000-0000-4000-8000-000000230102';
  ck uuid;
begin
  if (select sum(progress_value) from public.task_progress where task_id = t1) <> 380 then
    raise exception 'FAIL: A does not see the live total of their linked task';
  end if;
  if (select count(*) from public.task_progress where task_id = t2) <> 0 then
    raise exception 'FAIL: A can read B''s synced progress (A only linked it)';
  end if;

  -- The owner sees their own sync status; not a teammate's, even one they linked.
  if (select last_count from public.my_task_sync_status(t1)) is distinct from 380
     or (select last_checked_at from public.my_task_sync_status(t1)) is null then
    raise exception 'FAIL: A does not see the sync status of their own task';
  end if;
  if exists (select 1 from public.my_task_sync_status(t2)) then
    raise exception 'FAIL: A got the sync status of B''s task';
  end if;
  begin
    delete from public.task_progress where task_id = t1 and source = 'google_docs';
    if found then raise exception 'FAIL: A deleted synced rows'; end if;
  end;

  ck := public.submit_checkin(p, null);
  if not exists (
    select 1 from public.project_checkins c, jsonb_array_elements(c.snapshot) e
    where c.id = ck and e->>'task_id' = t1::text and (e->>'total')::numeric = 380
  ) then
    raise exception 'FAIL: A''s check-in does not carry the synced total';
  end if;
end $$;

reset role;


-- =============================================================================
-- As B (podmate, no Google): reads links and own totals; can unlink
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023b2","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  b    constant uuid := '00000000-0000-4000-8000-0000000023b2';
  t1   constant uuid := '00000000-0000-4000-8000-000000230101';
  t2   constant uuid := '00000000-0000-4000-8000-000000230102';
  t4   constant uuid := '00000000-0000-4000-8000-000000230104';
begin
  if (select count(*) from public.task_sources) <> 3 then
    raise exception 'FAIL: B cannot see the pod''s task sources';
  end if;
  if (select state from public.task_sources where task_id = t1) <> 'ok' then
    raise exception 'FAIL: B cannot read a source''s state';
  end if;
  -- No numbers or times of A's task: not through the function, not directly.
  if exists (select 1 from public.my_task_sync_status(t1)) then
    raise exception 'FAIL: B got the sync status of A''s task';
  end if;
  begin
    perform 1 from private.task_source_sync where task_id = t1;
    raise exception 'FAIL: B read private.task_source_sync';
  exception when insufficient_privilege then null;
  end;
  if (select last_count from public.my_task_sync_status(t2)) is distinct from 5 then
    raise exception 'FAIL: B does not see the sync status of B''s own task';
  end if;
  if public.has_google_connection() then
    raise exception 'FAIL: has_google_connection is true for B';
  end if;

  -- 0022's rule: B sees the progress on B's own task, none of A's.
  if (select sum(progress_value) from public.task_progress where task_id = t2) <> 5 then
    raise exception 'FAIL: B does not see the live total of B''s linked task';
  end if;
  if (select count(*) from public.task_progress where task_id = t1) <> 0 then
    raise exception 'FAIL: B can read A''s synced progress';
  end if;

  -- Students never write synced rows, even on their own task.
  begin
    insert into public.task_progress (task_id, user_id, progress_value, source) values (t2, b, 3, 'google_slides');
    raise exception 'FAIL: B wrote a google_slides progress row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_progress (task_id, user_id, progress_value) values (t2, b, 1);
    raise exception 'FAIL: B logged by hand on a linked task';
  exception when insufficient_privilege then null;
  end;

  -- Linking needs Google connected.
  begin
    perform public.link_task_source(t4, 'doc', '1DocFileAbCdEfGhIjKlMnOpQrStUvWx', 'Doc');
    raise exception 'FAIL: B linked a file without Google connected';
  exception when sqlstate 'SP010' then null;
  end;

  -- Any member may unlink (B unlinks A's script).
  perform public.unlink_task_source(t1);
  if exists (select 1 from public.task_sources where task_id = t1) then
    raise exception 'FAIL: B could not unlink a task';
  end if;
end $$;

reset role;


-- =============================================================================
-- As A: relink the same section; nothing is counted twice
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a  constant uuid := '00000000-0000-4000-8000-0000000023a1';
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
begin
  if (select source from public.project_tasks where id = t1) <> 'manual' then
    raise exception 'FAIL: unlinking did not set the task back to manual';
  end if;
  -- Unlinked: ＋記録 works again, then the link takes it into account.
  insert into public.task_progress (task_id, user_id, progress_value) values (t1, a, 20);
  perform public.link_task_source(t1, 'doc_section', '1DocFileAbCdEfGhIjKlMnOpQrStUvWx', 'Intro', 'h.abc123');
end $$;

reset role;

set local role service_role;
do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
begin
  -- The file still says 380; the total was 400 (380 + 20 by hand): it goes back to 380.
  if public.record_synced_count(t1, 380) <> -20
     or public.record_synced_count(t1, 410) <> 30 then
    raise exception 'FAIL: a relink counted the file twice or lost the manual entry';
  end if;
end $$;
reset role;

do $$
begin
  if (select sum(progress_value) from public.task_progress
       where task_id = '00000000-0000-4000-8000-000000230101') <> 410 then
    raise exception 'FAIL: after a relink the total is not the live count of 410';
  end if;
end $$;


-- =============================================================================
-- As C (another pod, Google connected) — sees and links nothing of P's
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023c3","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
  t4 constant uuid := '00000000-0000-4000-8000-000000230104';
begin
  if (select count(*) from public.task_sources) <> 0
     or (select count(*) from public.task_progress) <> 0 then
    raise exception 'FAIL: a student in another pod can read P''s sources or progress';
  end if;
  if exists (select 1 from public.my_task_sync_status(t1)) then
    raise exception 'FAIL: a student in another pod got a sync status';
  end if;
  begin
    perform 1 from private.task_source_sync;
    raise exception 'FAIL: C read private.task_source_sync';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.link_task_source(t4, 'doc', '1DocFileAbCdEfGhIjKlMnOpQrStUvWx', 'Mine now');
    raise exception 'FAIL: a student in another pod linked P''s task';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.unlink_task_source(t1);
    raise exception 'FAIL: a student in another pod unlinked P''s task';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_synced_count(t1, 0);
    raise exception 'FAIL: C called record_synced_count';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- As O (organizer, Google connected) — blocked like any outsider
-- =============================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023e5","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
  t4 constant uuid := '00000000-0000-4000-8000-000000230104';
begin
  if (select count(*) from public.task_sources) <> 0
     or (select count(*) from public.task_progress) <> 0 then
    raise exception 'FAIL: an organizer can read sources or progress';
  end if;
  if exists (select 1 from public.my_task_sync_status(t1)) then
    raise exception 'FAIL: an organizer got a sync status';
  end if;
  begin
    perform 1 from private.task_source_sync;
    raise exception 'FAIL: an organizer read private.task_source_sync';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.link_task_source(t4, 'doc', '1DocFileAbCdEfGhIjKlMnOpQrStUvWx', 'Org');
    raise exception 'FAIL: an organizer linked a task';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.unlink_task_source(t1);
    raise exception 'FAIL: an organizer unlinked a task';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_task_source_lost(t1);
    raise exception 'FAIL: an organizer called mark_task_source_lost';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- =============================================================================
-- Logged out (anon) — nothing
-- =============================================================================

set local role anon;

do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-000000230101';
begin
  begin perform 1 from public.task_sources; raise exception 'FAIL: anon read task_sources';
  exception when insufficient_privilege then null; end;
  begin perform 1 from private.google_credentials; raise exception 'FAIL: anon read google_credentials';
  exception when insufficient_privilege then null; end;
  begin perform 1 from private.task_source_sync; raise exception 'FAIL: anon read task_source_sync';
  exception when insufficient_privilege then null; end;
  begin perform public.my_task_sync_status(t1); raise exception 'FAIL: anon called my_task_sync_status';
  exception when insufficient_privilege then null; end;
  begin perform public.has_google_connection(); raise exception 'FAIL: anon called has_google_connection';
  exception when insufficient_privilege then null; end;
  begin perform public.get_google_credentials('00000000-0000-4000-8000-0000000023a1');
    raise exception 'FAIL: anon called get_google_credentials';
  exception when insufficient_privilege then null; end;
  begin perform public.record_synced_count(t1, 0); raise exception 'FAIL: anon called record_synced_count';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_task_source_lost(t1); raise exception 'FAIL: anon called mark_task_source_lost';
  exception when insufficient_privilege then null; end;
  begin perform public.link_task_source(t1, 'doc', '1DocFileAbCdEfGhIjKlMnOpQrStUvWx', 'x');
    raise exception 'FAIL: anon called link_task_source';
  exception when insufficient_privilege then null; end;
  begin perform public.unlink_task_source(t1); raise exception 'FAIL: anon called unlink_task_source';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_my_google_credentials(); raise exception 'FAIL: anon called delete_my_google_credentials';
  exception when insufficient_privilege then null; end;
end $$;

reset role;


-- =============================================================================
-- Disconnecting, deleting an account, leaving the pod
-- =============================================================================

-- A disconnects Google: A's token goes, A's links can't be read.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000023a1","role":"authenticated"}', true);
set local role authenticated;
select public.delete_my_google_credentials();
reset role;

do $$
begin
  if exists (select 1 from private.google_credentials where user_id = '00000000-0000-4000-8000-0000000023a1') then
    raise exception 'FAIL: delete_my_google_credentials left A''s token';
  end if;
  if not exists (select 1 from private.google_credentials where user_id = '00000000-0000-4000-8000-0000000023c3') then
    raise exception 'FAIL: delete_my_google_credentials removed someone else''s token';
  end if;
  if exists (select 1 from public.task_sources
              where linked_by = '00000000-0000-4000-8000-0000000023a1' and state <> 'lost_access') then
    raise exception 'FAIL: A''s links were not marked lost_access after disconnecting';
  end if;

  -- Deleting an account takes its token with it.
  delete from auth.users where id = '00000000-0000-4000-8000-0000000023c3';
  if exists (select 1 from private.google_credentials where user_id = '00000000-0000-4000-8000-0000000023c3') then
    raise exception 'FAIL: a deleted account''s Google token stayed';
  end if;

  -- A reconnects (a sync succeeds again), then leaves the pod: A's links no
  -- longer use A's token.
  perform public.save_google_credentials('00000000-0000-4000-8000-0000000023a1', 'ciphertext-a2', 'sub-a');
  perform public.record_synced_count('00000000-0000-4000-8000-000000230102', 5);
  if (select state from public.task_sources where task_id = '00000000-0000-4000-8000-000000230102') <> 'ok' then
    raise exception 'FAIL: a sync after reconnecting did not set the link back to ok';
  end if;
  delete from public.pairing_members
   where pairing_id = '00000000-0000-4000-8000-0000000023f1'
     and user_id = '00000000-0000-4000-8000-0000000023a1';
  if exists (select 1 from public.task_sources where linked_by = '00000000-0000-4000-8000-0000000023a1') then
    raise exception 'FAIL: a link still uses the token of someone who left the pod';
  end if;
  if (select state from public.task_sources where task_id = '00000000-0000-4000-8000-000000230102') <> 'lost_access' then
    raise exception 'FAIL: a link made by someone who left was not marked lost_access';
  end if;

  -- Deleting a task removes its link.
  delete from public.project_tasks where id = '00000000-0000-4000-8000-000000230102';
  if exists (select 1 from public.task_sources where task_id = '00000000-0000-4000-8000-000000230102')
     or exists (select 1 from private.task_source_sync where task_id = '00000000-0000-4000-8000-000000230102') then
    raise exception 'FAIL: deleting a task left its link or sync state behind';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
