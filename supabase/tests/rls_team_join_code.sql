-- =============================================================================
-- rls_team_join_code.sql — tests for 0028 (team join code and QR)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A    — class K, pod F1 (the code is shown to A)
--   C    — class K, no pod (joins F1 by code)
--   N    — not in class K (joins by code: class + pod)
--   D    — class K, alone in pod F2 (can't take a second pod: SP002)
--   O    — organizer of K (SP003)
--   S1–S3 — fill F1 up to 6, then E (class K) is refused: SP014
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000028a1', 'rls-test-ja@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000028c3', 'rls-test-jc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000028d4', 'rls-test-jd@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000028e5', 'rls-test-jo@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000028f6', 'rls-test-jn@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000002811', 'rls-test-js1@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000002812', 'rls-test-js2@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000002813', 'rls-test-js3@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000028ee', 'rls-test-je@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000028c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000028e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000028a1', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000028c3', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000028d4', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-000000002811', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-000000002812', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-000000002813', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000028ee', '00000000-0000-4000-8000-00000028c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000028e5', '00000000-0000-4000-8000-00000028c1a5', 'organizer');

-- New pods get a code from the trigger.
insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000028f1', '00000000-0000-4000-8000-00000028c1a5'),
  ('00000000-0000-4000-8000-0000000028f2', '00000000-0000-4000-8000-00000028c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000028f1', '00000000-0000-4000-8000-0000000028a1'),
  ('00000000-0000-4000-8000-0000000028f2', '00000000-0000-4000-8000-0000000028d4');

do $$
begin
  if (select count(*) from public.pod_join_codes
      where pod_id in ('00000000-0000-4000-8000-0000000028f1', '00000000-0000-4000-8000-0000000028f2')) <> 2 then
    raise exception 'FAIL: every new pod should get a join code';
  end if;
  if exists (select 1 from public.pod_join_codes where code !~ '^[A-HJKMNP-Z2-9]{8}$') then
    raise exception 'FAIL: a code is not 8 characters of the join alphabet';
  end if;
end $$;

-- Remember F1's code for the impersonated checks (a transaction-local setting).
select set_config('rls_test.f1_code',
  (select code from public.pod_join_codes where pod_id = '00000000-0000-4000-8000-0000000028f1'), true);

-- =============================================================================
-- As A (member): reads the code; can replace it
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000028a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n integer;
begin
  select count(*) into n from public.pod_join_codes;
  if n <> 1 then raise exception 'FAIL: a member should read exactly their own pod''s code, got %', n; end if;
  begin
    insert into public.pod_join_codes (pod_id, code) values ('00000000-0000-4000-8000-0000000028f2', 'AAAAAAAA');
    raise exception 'FAIL: a client must not write codes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.new_pod_join_code('00000000-0000-4000-8000-0000000028f2');
    raise exception 'FAIL: a non-member must not replace another pod''s code';
  exception when insufficient_privilege then null;
  end;
end $$;

-- =============================================================================
-- As C (classmate, no pod): can't read the code; looks it up; joins
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000028c3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
  pod uuid;
begin
  if exists (select 1 from public.pod_join_codes) then
    raise exception 'FAIL: a classmate outside the pod must not read its code';
  end if;
  select * into r from public.pod_by_join_code(lower(current_setting('rls_test.f1_code')));
  if r.pod_id is distinct from '00000000-0000-4000-8000-0000000028f1' or r.member_count <> 1 or r.is_member or not r.in_class then
    raise exception 'FAIL: pod_by_join_code (lower case) gave %', r;
  end if;
  if exists (select 1 from public.pod_by_join_code('ZZZZZZZZ')) then
    raise exception 'FAIL: an unknown code must find nothing';
  end if;
  pod := public.join_pod_by_code(current_setting('rls_test.f1_code'));
  if pod is distinct from '00000000-0000-4000-8000-0000000028f1' then raise exception 'FAIL: join_pod_by_code returned %', pod; end if;
  -- Again: already in, no error.
  perform public.join_pod_by_code(current_setting('rls_test.f1_code'));
  begin
    perform public.join_pod_by_code('ZZZZZZZZ');
    raise exception 'FAIL: an unknown code must be refused';
  exception when sqlstate 'SP015' then null;
  end;
end $$;

-- =============================================================================
-- As N (not in the class): joins the class as a student, and the pod
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000028f6","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.pod_by_join_code(current_setting('rls_test.f1_code'));
  if r.in_class then raise exception 'FAIL: N is not in the class yet'; end if;
  perform public.join_pod_by_code(current_setting('rls_test.f1_code'));
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.class_memberships
                 where user_id = '00000000-0000-4000-8000-0000000028f6'
                   and class_id = '00000000-0000-4000-8000-00000028c1a5' and role = 'student') then
    raise exception 'FAIL: joining by team code should add the class membership as a student';
  end if;
end $$;

-- =============================================================================
-- As D (already in pod F2): SP002. As O (organizer): SP003.
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000028d4","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.join_pod_by_code(current_setting('rls_test.f1_code'));
  raise exception 'FAIL: a student already in a pod in this class must be refused';
exception when sqlstate 'SP002' then null;
end $$;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000028e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.pod_join_codes) then
    raise exception 'FAIL: an organizer must not read pod codes';
  end if;
  perform public.join_pod_by_code(current_setting('rls_test.f1_code'));
  raise exception 'FAIL: an organizer must be refused';
exception when sqlstate 'SP003' then null;
end $$;

-- =============================================================================
-- Full at 6: S1–S3 join (A, C, N already in = 6), then E is refused (SP014)
-- =============================================================================
reset role;
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000028f1', '00000000-0000-4000-8000-000000002811'),
  ('00000000-0000-4000-8000-0000000028f1', '00000000-0000-4000-8000-000000002812'),
  ('00000000-0000-4000-8000-0000000028f1', '00000000-0000-4000-8000-000000002813');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000028ee","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.join_pod_by_code(current_setting('rls_test.f1_code'));
  raise exception 'FAIL: a full team (6) must refuse a new member';
exception when sqlstate 'SP014' then null;
end $$;

-- =============================================================================
-- Logged out
-- =============================================================================
reset role;
set local role anon;
do $$
begin
  begin
    perform public.join_pod_by_code('ZZZZZZZZ');
    raise exception 'FAIL: anon must not run join_pod_by_code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.pod_join_codes;
    raise exception 'FAIL: anon must not read pod_join_codes';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
