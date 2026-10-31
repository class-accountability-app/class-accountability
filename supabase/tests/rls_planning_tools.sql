-- =============================================================================
-- rls_planning_tools.sql — tests for 0038 (task order, meeting notes, teacher
-- milestones, auto-done from Google, weekly digest and team-inactive pushes)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, team F1, project P1 (tasks T1, T2, T3)
--   C    — class K, team F2, project P2 (task T4)
--   O    — organizer of K
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000038a1', 'rls-test-pla@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000038b2', 'rls-test-plb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000038c3', 'rls-test-plc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000038e5', 'rls-test-plo@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000038c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000038e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000038a1', '00000000-0000-4000-8000-00000038c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000038b2', '00000000-0000-4000-8000-00000038c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000038c3', '00000000-0000-4000-8000-00000038c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000038e5', '00000000-0000-4000-8000-00000038c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000038f1', '00000000-0000-4000-8000-00000038c1a5'),
  ('00000000-0000-4000-8000-0000000038f2', '00000000-0000-4000-8000-00000038c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000038f1', '00000000-0000-4000-8000-0000000038a1'),
  ('00000000-0000-4000-8000-0000000038f1', '00000000-0000-4000-8000-0000000038b2'),
  ('00000000-0000-4000-8000-0000000038f2', '00000000-0000-4000-8000-0000000038c3');

insert into public.projects (id, pairing_id, title, created_at) values
  ('00000000-0000-4000-8000-00000038a0b1', '00000000-0000-4000-8000-0000000038f1', 'P1', now() - interval '10 days'),
  ('00000000-0000-4000-8000-00000038a0b2', '00000000-0000-4000-8000-0000000038f2', 'P2', now());

insert into public.project_tasks (id, project_id, title, owner_id, metric, target_amount) values
  ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-00000038a0b1', 'T1', '00000000-0000-4000-8000-0000000038a1', 'characters', 100),
  ('00000000-0000-4000-8000-0000000038d2', '00000000-0000-4000-8000-00000038a0b1', 'T2', '00000000-0000-4000-8000-0000000038b2', 'status', null),
  ('00000000-0000-4000-8000-0000000038d3', '00000000-0000-4000-8000-00000038a0b1', 'T3', null, 'status', null),
  ('00000000-0000-4000-8000-0000000038d4', '00000000-0000-4000-8000-00000038a0b2', 'T4', '00000000-0000-4000-8000-0000000038c3', 'status', null);

insert into public.meeting_polls (id, project_id, created_by, title, status) values
  ('00000000-0000-4000-8000-0000000038aa', '00000000-0000-4000-8000-00000038a0b1', '00000000-0000-4000-8000-0000000038a1', 'Meeting', 'confirmed');

-- =============================================================================
-- As A: task order (any length of loop refused), meeting notes
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  insert into public.task_dependencies (task_id, depends_on) values
    ('00000000-0000-4000-8000-0000000038d2', '00000000-0000-4000-8000-0000000038d1'),
    ('00000000-0000-4000-8000-0000000038d3', '00000000-0000-4000-8000-0000000038d2');

  begin
    insert into public.task_dependencies (task_id, depends_on)
    values ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-0000000038d2');
    raise exception 'FAIL: a two-task loop must be refused';
  exception when sqlstate 'SP018' then null;
  end;
  begin
    insert into public.task_dependencies (task_id, depends_on)
    values ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-0000000038d3');
    raise exception 'FAIL: a three-task loop must be refused';
  exception when sqlstate 'SP018' then null;
  end;
  begin
    insert into public.task_dependencies (task_id, depends_on)
    values ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-0000000038d4');
    raise exception 'FAIL: a task must not wait on another team''s task';
  exception when sqlstate 'SP018' then null;
  end;
  begin
    insert into public.task_dependencies (task_id, depends_on)
    values ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-0000000038d1');
    raise exception 'FAIL: a task must not wait on itself';
  exception when check_violation then null;
  end;

  insert into public.meeting_notes (poll_id, body, updated_by)
  values ('00000000-0000-4000-8000-0000000038aa', '決まったこと', '00000000-0000-4000-8000-0000000038a1');
  begin
    update public.meeting_notes set body = 'x', updated_by = '00000000-0000-4000-8000-0000000038b2'
    where poll_id = '00000000-0000-4000-8000-0000000038aa';
    raise exception 'FAIL: a note must not be saved in a teammate''s name';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.meeting_notes set body = repeat('あ', 2001), updated_by = '00000000-0000-4000-8000-0000000038a1'
    where poll_id = '00000000-0000-4000-8000-0000000038aa';
    raise exception 'FAIL: a note over 2,000 characters must be refused';
  exception when check_violation then null;
  end;

  -- Milestones are the organizer's.
  begin
    perform public.add_class_milestone('00000000-0000-4000-8000-00000038c1a5', 'x', current_date, 10);
    raise exception 'FAIL: a student must not add milestones';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B (teammate) reads both and edits the note in their own name.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.task_dependencies) <> 2 then
    raise exception 'FAIL: B should read the team''s two dependencies';
  end if;
  update public.meeting_notes set body = '次にやること', updated_by = '00000000-0000-4000-8000-0000000038b2',
    updated_at = '2000-01-01'
  where poll_id = '00000000-0000-4000-8000-0000000038aa';
  if (select body from public.meeting_notes) is distinct from '次にやること' then
    raise exception 'FAIL: B should be able to edit the note';
  end if;
  if (select updated_at from public.meeting_notes) < now() - interval '1 minute' then
    raise exception 'FAIL: updated_at must be the server''s clock';
  end if;
  delete from public.task_dependencies
  where task_id = '00000000-0000-4000-8000-0000000038d3' and depends_on = '00000000-0000-4000-8000-0000000038d2';
  if (select count(*) from public.task_dependencies) <> 1 then
    raise exception 'FAIL: B should be able to remove a dependency';
  end if;
end $$;

-- C (other team): sees and changes nothing of F1's.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.task_dependencies) or exists (select 1 from public.meeting_notes) then
    raise exception 'FAIL: another team must not read F1''s order or notes';
  end if;
  begin
    insert into public.task_dependencies (task_id, depends_on)
    values ('00000000-0000-4000-8000-0000000038d3', '00000000-0000-4000-8000-0000000038d1');
    raise exception 'FAIL: another team must not add F1''s dependencies';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.meeting_notes (poll_id, body, updated_by)
    values ('00000000-0000-4000-8000-0000000038aa', 'x', '00000000-0000-4000-8000-0000000038c3');
    raise exception 'FAIL: another team must not write F1''s notes';
  exception when insufficient_privilege or unique_violation then null;
  end;
end $$;

-- =============================================================================
-- As O: milestones (organizer only; counts, never names)
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  perform public.add_class_milestone('00000000-0000-4000-8000-00000038c1a5', '構成', (now() at time zone 'Asia/Tokyo')::date + 7, 1);
  select * into r from public.class_milestone_status('00000000-0000-4000-8000-00000038c1a5');
  if r.teams <> 2 or r.reached <> 0 then
    raise exception 'FAIL: 2 teams, none at 1%% yet: %', r;
  end if;
  if exists (select 1 from public.task_dependencies) then
    raise exception 'FAIL: the organizer must not read a team''s task order';
  end if;
end $$;

-- A reads the milestone but gets no status rows.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.class_milestones) <> 1 then
    raise exception 'FAIL: a student should read the class''s milestone';
  end if;
  if exists (select 1 from public.class_milestone_status('00000000-0000-4000-8000-00000038c1a5')) then
    raise exception 'FAIL: a student must not see milestone status';
  end if;
  begin
    perform public.delete_class_milestone((select id from public.class_milestones limit 1));
    raise exception 'FAIL: a student must not delete milestones';
  exception when insufficient_privilege then null;
  end;
end $$;

-- =============================================================================
-- As the server: pushes, then auto-done from Google
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  got text;
begin
  perform private.queue_team_inactive_alerts();
  -- P1 is 10 days old with no activity; P2 is new. One alert for O.
  if (select count(*) from public.push_events
      where kind = 'team_inactive' and class_id = '00000000-0000-4000-8000-00000038c1a5'
        and user_id = '00000000-0000-4000-8000-0000000038e5') <> 1 then
    raise exception 'FAIL: the organizer should get one team-inactive alert';
  end if;
  perform private.queue_team_inactive_alerts();
  if (select count(*) from public.push_events
      where kind = 'team_inactive' and class_id = '00000000-0000-4000-8000-00000038c1a5') <> 1 then
    raise exception 'FAIL: the alert must be queued once a day';
  end if;

  perform private.queue_weekly_digests();
  select string_agg(right(user_id::text, 4), ',' order by user_id) into got
  from public.push_events
  where kind = 'weekly_digest'
    and project_id in ('00000000-0000-4000-8000-00000038a0b1', '00000000-0000-4000-8000-00000038a0b2');
  if got is distinct from '38a1,38b2,38c3' then
    raise exception 'FAIL: weekly digest for %, expected 38a1,38b2,38c3', got;
  end if;

  begin
    insert into public.push_events (user_id, kind, ref_key)
    values ('00000000-0000-4000-8000-0000000038e5', 'team_inactive', 'x');
    raise exception 'FAIL: a team-inactive push without a class must be refused';
  exception when check_violation then null;
  end;

  -- Google counts T1 up to its goal (100): it becomes done.
  insert into public.task_progress (task_id, user_id, progress_value, source)
  values ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-0000000038a1', 60, 'google_docs');
  if (select status from public.project_tasks where id = '00000000-0000-4000-8000-0000000038d1') = 'done' then
    raise exception 'FAIL: 60/100 is not done yet';
  end if;
  insert into public.task_progress (task_id, user_id, progress_value, source)
  values ('00000000-0000-4000-8000-0000000038d1', '00000000-0000-4000-8000-0000000038a1', 40, 'google_docs');
  if (select status from public.project_tasks where id = '00000000-0000-4000-8000-0000000038d1') <> 'done' then
    raise exception 'FAIL: reaching the goal from Google should mark the task done';
  end if;

end $$;

-- A finishes P1.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038a1","role":"authenticated"}', true);
set local role authenticated;
select public.finish_project('00000000-0000-4000-8000-00000038a0b1');
reset role;

-- A finished project's order and notes are read-only.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000038a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.task_dependencies (task_id, depends_on)
    values ('00000000-0000-4000-8000-0000000038d3', '00000000-0000-4000-8000-0000000038d1');
    raise exception 'FAIL: a finished project''s order must not change';
  exception when sqlstate 'SP016' then null;
  end;
  begin
    update public.meeting_notes set body = 'late', updated_by = '00000000-0000-4000-8000-0000000038a1'
    where poll_id = '00000000-0000-4000-8000-0000000038aa';
    raise exception 'FAIL: a finished project''s notes must not change';
  exception when sqlstate 'SP016' then null;
  end;
end $$;

-- Logged out: nothing.
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.task_dependencies;
    raise exception 'FAIL: anon must not read task_dependencies';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.meeting_notes;
    raise exception 'FAIL: anon must not read meeting_notes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.class_milestones;
    raise exception 'FAIL: anon must not read class_milestones';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
