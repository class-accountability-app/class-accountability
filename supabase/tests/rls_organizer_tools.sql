-- =============================================================================
-- rls_organizer_tools.sql — tests for 0036 (organizer runs the class's teams)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   O       — organizer of class K
--   S1–S7   — students of K, no team at the start
--   X       — organizer of another class L (not K)
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000036e5', 'rls-test-oo@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000036e6', 'rls-test-ox@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003601', 'rls-test-os1@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003602', 'rls-test-os2@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003603', 'rls-test-os3@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003604', 'rls-test-os4@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003605', 'rls-test-os5@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003606', 'rls-test-os6@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003607', 'rls-test-os7@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000036c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000036e5'),
  ('00000000-0000-4000-8000-00000036c1a6', 'RLS test class L', 'Test', 'test', '00000000-0000-4000-8000-0000000036e6');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000036e5', '00000000-0000-4000-8000-00000036c1a5', 'organizer'),
  ('00000000-0000-4000-8000-0000000036e6', '00000000-0000-4000-8000-00000036c1a6', 'organizer'),
  ('00000000-0000-4000-8000-000000003601', '00000000-0000-4000-8000-00000036c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003602', '00000000-0000-4000-8000-00000036c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003603', '00000000-0000-4000-8000-00000036c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003604', '00000000-0000-4000-8000-00000036c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003605', '00000000-0000-4000-8000-00000036c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003606', '00000000-0000-4000-8000-00000036c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003607', '00000000-0000-4000-8000-00000036c1a5', 'student');

-- =============================================================================
-- As O: roster with names, make a team, move, take out, auto-split, announce
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000036e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000036c1a5';
  s1 constant uuid := '00000000-0000-4000-8000-000000003601';
  s2 constant uuid := '00000000-0000-4000-8000-000000003602';
  s3 constant uuid := '00000000-0000-4000-8000-000000003603';
  t1 uuid;
  t2 uuid;
  made integer;
  n integer;
begin
  select count(*) into n from public.class_roster(k);
  if n <> 7 then raise exception 'FAIL: the roster should list the 7 students (not the organizer), got %', n; end if;
  if exists (select 1 from public.class_roster(k) where pod_id is not null) then
    raise exception 'FAIL: nobody has a team yet';
  end if;
  if exists (select 1 from public.class_roster(k) where display_name is null) then
    raise exception 'FAIL: the roster should carry display names';
  end if;

  begin
    perform public.organizer_create_team(k, 'Empty', '{}');
    raise exception 'FAIL: a team with nobody must be refused';
  exception when sqlstate 'SP017' then null;
  end;

  t1 := public.organizer_create_team(k, '  Team Sakura ', array[s1, s2]);
  if (select name from public.pairings where id = t1) <> 'Team Sakura' then
    raise exception 'FAIL: the team name should be trimmed and saved';
  end if;
  if (select count(*) from public.class_roster(k) where pod_id = t1) <> 2 then
    raise exception 'FAIL: S1 and S2 should be in the new team';
  end if;

  t2 := public.organizer_create_team(k, null, array[s3]);
  -- Move S2 to S3's team; then take S3 out (S2 stays).
  perform public.organizer_move_student(k, s2, t2);
  if (select pod_id from public.class_roster(k) where user_id = s2) is distinct from t2 then
    raise exception 'FAIL: S2 should now be in team 2';
  end if;
  perform public.organizer_move_student(k, s3, null);
  if (select pod_id from public.class_roster(k) where user_id = s3) is not null then
    raise exception 'FAIL: S3 should have no team now';
  end if;

  -- Moving the last member out of a team removes the empty team.
  perform public.organizer_move_student(k, s2, t1);
  if exists (select 1 from public.pairings where id = t2) then
    raise exception 'FAIL: an emptied team should be removed';
  end if;

  perform public.rename_team(t1, 'Sakura 2');

  begin
    perform public.organizer_auto_split(k, 7);
    raise exception 'FAIL: a team size of 7 must be refused';
  exception when sqlstate 'SP017' then null;
  end;

  -- S3–S7 (5 students) in teams of 2 → 3 teams (2, 2, 1).
  made := public.organizer_auto_split(k, 2);
  if made <> 3 then raise exception 'FAIL: 5 students in teams of 2 should make 3 teams, got %', made; end if;
  if exists (select 1 from public.class_roster(k) where pod_id is null) then
    raise exception 'FAIL: everyone should have a team after auto-split';
  end if;
  if exists (select 1 from public.pairing_members pm join public.pairings p on p.id = pm.pairing_id
             where p.class_id = k group by pm.pairing_id having count(*) > 2) then
    raise exception 'FAIL: auto-split made a team bigger than 2';
  end if;
  if public.organizer_auto_split(k, 3) <> 0 then
    raise exception 'FAIL: with nobody waiting, auto-split makes no teams';
  end if;

  perform public.post_class_announcement(k, '  来週は中間発表です。 ');
  if (select body from public.class_announcements where class_id = k) <> '来週は中間発表です。' then
    raise exception 'FAIL: the announcement should be saved trimmed';
  end if;
  begin
    insert into public.class_announcements (class_id, body) values (k, 'direct');
    raise exception 'FAIL: a client must not insert announcements directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Fill Sakura to 6, then a 7th is refused (SP014).
do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000036c1a5';
  t1 uuid := (select pod_id from public.class_roster('00000000-0000-4000-8000-00000036c1a5')
              where user_id = '00000000-0000-4000-8000-000000003601');
begin
  perform public.organizer_move_student(k, '00000000-0000-4000-8000-000000003603', t1);
  perform public.organizer_move_student(k, '00000000-0000-4000-8000-000000003604', t1);
  perform public.organizer_move_student(k, '00000000-0000-4000-8000-000000003605', t1);
  perform public.organizer_move_student(k, '00000000-0000-4000-8000-000000003606', t1);
  begin
    perform public.organizer_move_student(k, '00000000-0000-4000-8000-000000003607', t1);
    raise exception 'FAIL: a 7th member must be refused';
  exception when sqlstate 'SP014' then null;
  end;
  perform set_config('rls_test.t1', t1::text, true);
end $$;

-- =============================================================================
-- As S1 (student): no roster, no moving; renames own team; reads announcements
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000003601","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000036c1a5';
begin
  if exists (select 1 from public.class_roster(k)) then
    raise exception 'FAIL: a student must not get the roster';
  end if;
  begin
    perform public.organizer_move_student(k, '00000000-0000-4000-8000-000000003602', null);
    raise exception 'FAIL: a student must not move others';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.organizer_auto_split(k, 2);
    raise exception 'FAIL: a student must not auto-split';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.post_class_announcement(k, 'hi');
    raise exception 'FAIL: a student must not post announcements';
  exception when insufficient_privilege then null;
  end;
  perform public.rename_team(current_setting('rls_test.t1')::uuid, 'Our team');
  if (select count(*) from public.class_announcements where class_id = k) <> 1 then
    raise exception 'FAIL: a student should read the class announcement';
  end if;
end $$;

-- S7 (another team) can't rename S1's team.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000003607","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.rename_team(current_setting('rls_test.t1')::uuid, 'Hijacked');
  raise exception 'FAIL: a student outside the team must not rename it';
exception when insufficient_privilege then null;
end $$;

-- =============================================================================
-- As X (organizer of another class): nothing in K
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000036e6","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  k constant uuid := '00000000-0000-4000-8000-00000036c1a5';
begin
  if exists (select 1 from public.class_roster(k)) then
    raise exception 'FAIL: another class''s organizer must not get the roster';
  end if;
  if exists (select 1 from public.class_announcements where class_id = k) then
    raise exception 'FAIL: another class''s organizer must not read K''s announcements';
  end if;
  begin
    perform public.organizer_create_team(k, 'x', array['00000000-0000-4000-8000-000000003607'::uuid]);
    raise exception 'FAIL: another class''s organizer must not make teams in K';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_class_announcement((select id from public.class_announcements limit 1));
    raise exception 'FAIL: X deleted an announcement';
  exception when insufficient_privilege then null;
  end;
end $$;

-- =============================================================================
-- Logged out
-- =============================================================================
reset role;
set local role anon;
do $$
begin
  begin
    perform public.class_roster('00000000-0000-4000-8000-00000036c1a5');
    raise exception 'FAIL: anon must not run class_roster';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.class_announcements;
    raise exception 'FAIL: anon must not read announcements';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
