-- =============================================================================
-- rls_research_automation.sql — tests for 0041 (research_automation)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK. Nothing it writes survives, and it
-- prints nothing about anyone: failures name test-cast numbers only.
-- As in rls_research_metrics.sql, every account that isn't an rls-test-*
-- account is excluded inside this transaction, and research_start() moves to
-- this week, so only the cast counts and the output is one row.
--
-- Cast (all @andrew.ac.jp, this Tokyo week): S1..S10 students in class K, in
-- teams T1 {S1..S5} and T2 {S6..S10}, one counted task each. X11 is a student
-- of K excluded with reason 'opt_out' (in T2). OG organizer of K.
--   - S1..S10 log 1 entry by hand          → entries_manual 10
--   - S1..S5 get 2 Google entries each     → entries_google 10
--     (X11 gets 3, which must not count)
--   - S1 writes once in the editor         → entries_editor <5 (1 student)
--   - 5 of 10 active had Google entries    → pct_active_with_google 50%
--   - S1..S5 link a Google file (X11 too)  → google_links 5
--   - S1..S5 open a meeting poll           → polls_created 5, polls_confirmed <5
-- Then: anon and authenticated can't call the function.
-- =============================================================================

begin;

create function pg_temp.ra_uid(i integer) returns uuid
language sql immutable
as $$ select ('00000000-0000-4000-8000-0000000041' || lpad(i::text, 2, '0'))::uuid $$;

create or replace function private.research_start()
returns date
language sql
stable
set search_path = ''
as $$ select date_trunc('week', now() at time zone 'Asia/Tokyo')::date $$;

do $$
declare
  k   uuid := '00000000-0000-4000-8000-0000000041c1';
  t1  uuid := '00000000-0000-4000-8000-0000000041d1';
  t2  uuid := '00000000-0000-4000-8000-0000000041d2';
  pr1 uuid := '00000000-0000-4000-8000-0000000041e1';
  pr2 uuid := '00000000-0000-4000-8000-0000000041e2';
  og  uuid := pg_temp.ra_uid(99);
  i integer;
  task uuid;
begin
  for i in 1..11 loop
    insert into auth.users (id, email, aud, role)
    values (pg_temp.ra_uid(i), format('rls-test-auto-%s@andrew.ac.jp', i), 'authenticated', 'authenticated');
  end loop;
  insert into auth.users (id, email, aud, role)
  values (og, 'rls-test-auto-og@andrew.ac.jp', 'authenticated', 'authenticated');

  insert into private.research_excluded_users (user_id, reason)
  select id, 'other' from auth.users where email not like 'rls-test-%'
  on conflict (user_id) do nothing;
  insert into private.research_excluded_users (user_id, reason) values (pg_temp.ra_uid(11), 'opt_out')
  on conflict (user_id) do nothing;

  insert into public.classes (id, name, university, term, created_by)
  values (k, 'RLS test class automation', 'Test', 'test', og);
  insert into public.class_memberships (user_id, class_id, role) values (og, k, 'organizer');
  for i in 1..11 loop
    insert into public.class_memberships (user_id, class_id, role) values (pg_temp.ra_uid(i), k, 'student');
  end loop;

  insert into public.pairings (id, class_id) values (t1, k), (t2, k);
  for i in 1..11 loop
    insert into public.pairing_members (pairing_id, user_id)
    values (case when i <= 5 then t1 else t2 end, pg_temp.ra_uid(i));
  end loop;
  insert into public.projects (id, pairing_id, title) values (pr1, t1, 'P1'), (pr2, t2, 'P2');

  for i in 1..11 loop
    task := ('00000000-0000-4000-8000-0000000041' || lpad((i + 20)::text, 2, '0'))::uuid;
    insert into public.project_tasks (id, project_id, title, owner_id, metric, unit, target_amount)
    values (task, case when i <= 5 then pr1 else pr2 end, 'Task ' || i, pg_temp.ra_uid(i), 'count', 'words', 1000);

    if i <= 10 then
      insert into public.task_progress (task_id, user_id, progress_value, source)
      values (task, pg_temp.ra_uid(i), 1, 'manual');
    end if;
    if i <= 5 or i = 11 then
      insert into public.task_progress (task_id, user_id, progress_value, source)
      select task, pg_temp.ra_uid(i), 10, 'google_docs' from generate_series(1, case when i = 11 then 3 else 2 end);
      insert into public.task_sources (task_id, kind, file_id, label, linked_by)
      values (task, 'doc_words', 'TestFileId_' || lpad(i::text, 4, '0'), 'Essay', pg_temp.ra_uid(i));
    end if;
    if i = 1 then
      insert into public.task_progress (task_id, user_id, progress_value, source)
      values (task, pg_temp.ra_uid(i), 5, 'document');
    end if;
    if i <= 5 then
      insert into public.meeting_polls (project_id, created_by, title)
      values (pr1, pg_temp.ra_uid(i), 'Poll ' || i);
    end if;
  end loop;
end $$;

do $$
declare
  r record;
  n integer;
begin
  select count(*) into n from private.research_automation();
  if n <> 1 then
    raise exception 'FAIL: one week expected, got %', n;
  end if;
  select * into r from private.research_automation();
  if r.entries_manual is distinct from '10' then raise exception 'FAIL: entries_manual %', r.entries_manual; end if;
  if r.entries_google is distinct from '10' then raise exception 'FAIL: entries_google % (X11 must not count)', r.entries_google; end if;
  if r.entries_editor is distinct from '<5' then raise exception 'FAIL: entries_editor % (1 student must show <5)', r.entries_editor; end if;
  if r.pct_active_with_google is distinct from '50%' then raise exception 'FAIL: pct_active_with_google %', r.pct_active_with_google; end if;
  if r.google_links is distinct from '5' then raise exception 'FAIL: google_links %', r.google_links; end if;
  if r.polls_created is distinct from '5' then raise exception 'FAIL: polls_created %', r.polls_created; end if;
  if r.polls_confirmed is distinct from '<5' then raise exception 'FAIL: polls_confirmed %', r.polls_confirmed; end if;
  if r.week_complete then raise exception 'FAIL: this week is not complete yet'; end if;
end $$;

-- Nobody but the owner runs it.
set local role anon;
do $$
begin
  perform private.research_automation();
  raise exception 'FAIL: anon called research_automation()';
exception when insufficient_privilege then null;
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000004101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform private.research_automation();
  raise exception 'FAIL: a student called research_automation()';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'all RLS tests passed' as result;

rollback;
