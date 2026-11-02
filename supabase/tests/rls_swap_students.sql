-- =============================================================================
-- rls_swap_students.sql — tests for 0039 (the organizer swaps two students)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): O organizer of K; X organizer of another class L;
-- A1–A6 in full team TA, B1–B6 in full team TB, N a student of K with no team.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role)
select ('00000000-0000-4000-8000-0000000039' || lpad(to_hex(n), 2, '0'))::uuid,
       'rls-test-sw' || n || '@andrew.ac.jp', 'authenticated', 'authenticated'
from generate_series(1, 13) n;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000039e5', 'rls-test-swo@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000039e6', 'rls-test-swx@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000039c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000039e5'),
  ('00000000-0000-4000-8000-00000039c1a6', 'RLS test class L', 'Test', 'test', '00000000-0000-4000-8000-0000000039e6');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000039e5', '00000000-0000-4000-8000-00000039c1a5', 'organizer'),
  ('00000000-0000-4000-8000-0000000039e6', '00000000-0000-4000-8000-00000039c1a6', 'organizer');
insert into public.class_memberships (user_id, class_id, role)
select ('00000000-0000-4000-8000-0000000039' || lpad(to_hex(n), 2, '0'))::uuid,
       '00000000-0000-4000-8000-00000039c1a5', 'student'
from generate_series(1, 13) n;

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000039aa', '00000000-0000-4000-8000-00000039c1a5'),
  ('00000000-0000-4000-8000-0000000039bb', '00000000-0000-4000-8000-00000039c1a5');

-- Students 1–6 in TA, 7–12 in TB (both full); 13 (0d) has no team.
insert into public.pairing_members (pairing_id, user_id)
select case when n <= 6 then '00000000-0000-4000-8000-0000000039aa'::uuid
            else '00000000-0000-4000-8000-0000000039bb'::uuid end,
       ('00000000-0000-4000-8000-0000000039' || lpad(to_hex(n), 2, '0'))::uuid
from generate_series(1, 12) n;

-- =============================================================================
-- As O: swap across two full teams; refusals
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000039e5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  k  constant uuid := '00000000-0000-4000-8000-00000039c1a5';
  ta constant uuid := '00000000-0000-4000-8000-0000000039aa';
  tb constant uuid := '00000000-0000-4000-8000-0000000039bb';
  a1 constant uuid := '00000000-0000-4000-8000-000000003901';
  a2 constant uuid := '00000000-0000-4000-8000-000000003902';
  b1 constant uuid := '00000000-0000-4000-8000-000000003907';
  n0 constant uuid := '00000000-0000-4000-8000-00000000390d';
begin
  -- A plain move into a full team is refused (0036), which is why swap exists.
  begin
    perform public.organizer_move_student(k, a1, tb);
    raise exception 'FAIL: moving into a full team must be refused';
  exception when sqlstate 'SP014' then null;
  end;

  perform public.organizer_swap_students(k, a1, b1);
  if (select pod_id from public.class_roster(k) where user_id = a1) is distinct from tb
     or (select pod_id from public.class_roster(k) where user_id = b1) is distinct from ta then
    raise exception 'FAIL: A1 and B1 should have changed teams';
  end if;
  if (select count(*) from public.class_roster(k) where pod_id = ta) <> 6
     or (select count(*) from public.class_roster(k) where pod_id = tb) <> 6 then
    raise exception 'FAIL: both teams should still have 6';
  end if;

  begin
    perform public.organizer_swap_students(k, a2, b1); -- B1 is now in TA, like A2
    raise exception 'FAIL: two students in the same team must not be swapped';
  exception when sqlstate 'SP017' then null;
  end;
  begin
    perform public.organizer_swap_students(k, a2, n0);
    raise exception 'FAIL: a student without a team must not be swapped';
  exception when sqlstate 'SP017' then null;
  end;
end $$;

-- =============================================================================
-- Another class's organizer, a student, logged out: refused
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000039e6","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.organizer_swap_students('00000000-0000-4000-8000-00000039c1a5',
    '00000000-0000-4000-8000-000000003902', '00000000-0000-4000-8000-000000003908');
  raise exception 'FAIL: another class''s organizer must not swap K''s students';
exception when insufficient_privilege then null;
end $$;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000003902","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.organizer_swap_students('00000000-0000-4000-8000-00000039c1a5',
    '00000000-0000-4000-8000-000000003902', '00000000-0000-4000-8000-000000003908');
  raise exception 'FAIL: a student must not swap anyone';
exception when insufficient_privilege then null;
end $$;

reset role;
set local role anon;
do $$
begin
  perform public.organizer_swap_students('00000000-0000-4000-8000-00000039c1a5',
    '00000000-0000-4000-8000-000000003902', '00000000-0000-4000-8000-000000003908');
  raise exception 'FAIL: anon must not run organizer_swap_students';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
