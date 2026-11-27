-- =============================================================================
-- rls_team_size_limit.sql — tests for 0053 (the teacher sets the team size limit)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): O organizer of class K; X organizer of another
-- class L; S1–S6 in team TA of K (full at the default 6); S7 and S8 students
-- of K with no team.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role)
select ('00000000-0000-4000-8000-0000000053' || lpad(to_hex(n), 2, '0'))::uuid,
       'rls-test-tl' || n || '@andrew.ac.jp', 'authenticated', 'authenticated'
from generate_series(1, 8) n;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000053e5', 'rls-test-tlo@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000053e6', 'rls-test-tlx@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000053c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000053e5'),
  ('00000000-0000-4000-8000-00000053c1a6', 'RLS test class L', 'Test', 'test', '00000000-0000-4000-8000-0000000053e6');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000053e5', '00000000-0000-4000-8000-00000053c1a5', 'organizer'),
  ('00000000-0000-4000-8000-0000000053e6', '00000000-0000-4000-8000-00000053c1a6', 'organizer')
on conflict (user_id, class_id) do nothing;
insert into public.class_memberships (user_id, class_id, role)
select ('00000000-0000-4000-8000-0000000053' || lpad(to_hex(n), 2, '0'))::uuid,
       '00000000-0000-4000-8000-00000053c1a5', 'student'
from generate_series(1, 8) n;

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000053aa', '00000000-0000-4000-8000-00000053c1a5');
insert into public.pairing_members (pairing_id, user_id)
select '00000000-0000-4000-8000-0000000053aa'::uuid,
       ('00000000-0000-4000-8000-0000000053' || lpad(to_hex(n), 2, '0'))::uuid
from generate_series(1, 6) n;

-- TA's join code (0028 gives every new team one), kept for the student below.
select set_config('rls.ta_code',
  (select code from public.pod_join_codes where pod_id = '00000000-0000-4000-8000-0000000053aa'), true);

do $$
begin
  if (select team_size_limit from public.classes where id = '00000000-0000-4000-8000-00000053c1a5') <> 6 then
    raise exception 'FAIL: a class should start with a limit of 6';
  end if;
end $$;

-- =============================================================================
-- As O: change the limit; the tools follow it; nobody is removed
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000053e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  k  constant uuid := '00000000-0000-4000-8000-00000053c1a5';
  ta constant uuid := '00000000-0000-4000-8000-0000000053aa';
  s1 constant uuid := '00000000-0000-4000-8000-000000005301';
  s2 constant uuid := '00000000-0000-4000-8000-000000005302';
  s3 constant uuid := '00000000-0000-4000-8000-000000005303';
  s4 constant uuid := '00000000-0000-4000-8000-000000005304';
  s5 constant uuid := '00000000-0000-4000-8000-000000005305';
  s7 constant uuid := '00000000-0000-4000-8000-000000005307';
begin
  begin
    perform public.set_team_size_limit(k, 1);
    raise exception 'FAIL: a limit of 1 must be refused';
  exception when sqlstate 'SP017' then null;
  end;
  begin
    perform public.set_team_size_limit(k, 11);
    raise exception 'FAIL: a limit of 11 must be refused';
  exception when sqlstate 'SP017' then null;
  end;

  -- At the default 6, TA is full.
  begin
    perform public.organizer_move_student(k, s7, ta);
    raise exception 'FAIL: moving into a team of 6 at limit 6 must be refused';
  exception when sqlstate 'SP014' then null;
  end;

  perform public.set_team_size_limit(k, 8);
  perform public.organizer_move_student(k, s7, ta);
  if (select count(*) from public.class_roster(k) where pod_id = ta) <> 7 then
    raise exception 'FAIL: at limit 8, TA should take a 7th member';
  end if;

  -- Lowering it removes nobody.
  perform public.set_team_size_limit(k, 4);
  if (select count(*) from public.class_roster(k) where pod_id = ta) <> 7 then
    raise exception 'FAIL: lowering the limit must not remove anyone';
  end if;

  begin
    perform public.organizer_auto_split(k, 5);
    raise exception 'FAIL: auto-split above the limit must be refused';
  exception when sqlstate 'SP017' then null;
  end;
  begin
    perform public.organizer_create_team(k, null, array[s1, s2, s3, s4, s5]);
    raise exception 'FAIL: a new team above the limit must be refused';
  exception when sqlstate 'SP014' then null;
  end;
end $$;

-- =============================================================================
-- As S8 (no team): the join page shows the limit; a full team refuses; a
-- student can't change the limit, by function or by a direct update
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000005308","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select team_limit from public.pod_by_join_code(current_setting('rls.ta_code'))) <> 4 then
    raise exception 'FAIL: pod_by_join_code should return the class limit (4)';
  end if;
  begin
    perform public.join_pod_by_code(current_setting('rls.ta_code'));
    raise exception 'FAIL: joining a team over the limit must be refused';
  exception when sqlstate 'SP014' then null;
  end;
  begin
    perform public.set_team_size_limit('00000000-0000-4000-8000-00000053c1a5', 10);
    raise exception 'FAIL: a student must not change the limit';
  exception when insufficient_privilege then null;
  end;
  -- No UPDATE policy on classes: either no row changes or the grant refuses.
  begin
    update public.classes set team_size_limit = 10 where id = '00000000-0000-4000-8000-00000053c1a5';
  exception when insufficient_privilege then null;
  end;
  if (select team_size_limit from public.classes where id = '00000000-0000-4000-8000-00000053c1a5') <> 4 then
    raise exception 'FAIL: a direct update must not change the limit';
  end if;
end $$;

-- =============================================================================
-- Another class's organizer and logged out: refused
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000053e6","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.set_team_size_limit('00000000-0000-4000-8000-00000053c1a5', 10);
  raise exception 'FAIL: another class''s organizer must not change K''s limit';
exception when insufficient_privilege then null;
end $$;

reset role;
set local role anon;
do $$
begin
  perform public.set_team_size_limit('00000000-0000-4000-8000-00000053c1a5', 10);
  raise exception 'FAIL: anon must not run set_team_size_limit';
exception when insufficient_privilege then null;
end $$;

-- =============================================================================
-- As O: raise it to 10; now S8 can join TA by code
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000053e5","role":"authenticated"}', true);
set local role authenticated;
select public.set_team_size_limit('00000000-0000-4000-8000-00000053c1a5', 10);

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000005308","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.join_pod_by_code(current_setting('rls.ta_code'));
  if not exists (select 1 from public.pairing_members
                 where pairing_id = '00000000-0000-4000-8000-0000000053aa'
                   and user_id = '00000000-0000-4000-8000-000000005308') then
    raise exception 'FAIL: at limit 10, S8 should join TA (8 members)';
  end if;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
