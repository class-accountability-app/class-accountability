-- =============================================================================
-- rls_team_away.sql — tests for 0049 (お休み, away status)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): A, B teammates in team F; X a classmate in no
-- team; O the class's organizer.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000049a1', 'rls-test-wa@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000049b2', 'rls-test-wb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000049e5', 'rls-test-wo@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000049f6', 'rls-test-wx@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000049c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000049e5');
insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000049a1', '00000000-0000-4000-8000-00000049c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000049b2', '00000000-0000-4000-8000-00000049c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000049f6', '00000000-0000-4000-8000-00000049c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000049e5', '00000000-0000-4000-8000-00000049c1a5', 'organizer')
on conflict (user_id, class_id) do nothing;
insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000049f1', '00000000-0000-4000-8000-00000049c1a5');
insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000049f1', '00000000-0000-4000-8000-0000000049a1'),
  ('00000000-0000-4000-8000-0000000049f1', '00000000-0000-4000-8000-0000000049b2');

-- As A: sets a break; bad dates are refused; a client can't write the table.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000049a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  perform public.set_away(today + 3);
  if (select away_until from public.member_presence
      where user_id = '00000000-0000-4000-8000-0000000049a1') is distinct from today + 3 then
    raise exception 'FAIL: A should read their own away day';
  end if;
  begin
    perform public.set_away(today - 1);
    raise exception 'FAIL: a past day must be refused';
  exception when check_violation then null;
  end;
  begin
    perform public.set_away(today + 31);
    raise exception 'FAIL: more than 30 days ahead must be refused';
  exception when check_violation then null;
  end;
  begin
    update public.member_presence set away_until = today + 20
    where user_id = '00000000-0000-4000-8000-0000000049a1';
    raise exception 'FAIL: a client must not write member_presence directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- As B (a teammate): sees that A is away and until when, but not A's row.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000049b2","role":"authenticated"}', true);
do $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  n integer;
begin
  select count(*) into n from public.team_away('00000000-0000-4000-8000-0000000049f1');
  if n <> 1 then raise exception 'FAIL: B should see one teammate away, got %', n; end if;
  if not exists (select 1 from public.team_away('00000000-0000-4000-8000-0000000049f1')
                 where user_id = '00000000-0000-4000-8000-0000000049a1' and away_until = today + 3) then
    raise exception 'FAIL: B should see A away until the day A chose';
  end if;
  if exists (select 1 from public.member_presence where user_id = '00000000-0000-4000-8000-0000000049a1') then
    raise exception 'FAIL: B must not read A''s presence row';
  end if;
end $$;

-- As X (a classmate outside the team) and O (the organizer): nothing.
do $$
declare
  u text;
begin
  foreach u in array array['00000000-0000-4000-8000-0000000049f6', '00000000-0000-4000-8000-0000000049e5'] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', u), true);
    if exists (select 1 from public.team_away('00000000-0000-4000-8000-0000000049f1')) then
      raise exception 'FAIL: % must not see who is away in the team', u;
    end if;
  end loop;
end $$;

-- A break that has ended is not returned; A can also clear one early.
reset role;
update public.member_presence set away_until = (now() at time zone 'Asia/Tokyo')::date - 1
where user_id = '00000000-0000-4000-8000-0000000049a1';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000049b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.team_away('00000000-0000-4000-8000-0000000049f1')) then
    raise exception 'FAIL: a break that ended yesterday must not show';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000049a1","role":"authenticated"}', true);
do $$
begin
  perform public.set_away((now() at time zone 'Asia/Tokyo')::date);
  perform public.set_away(null);
  if (select away_until from public.member_presence
      where user_id = '00000000-0000-4000-8000-0000000049a1') is not null then
    raise exception 'FAIL: set_away(null) should clear the break';
  end if;
end $$;

-- Logged out.
reset role;
set local role anon;
do $$
begin
  begin
    perform public.team_away('00000000-0000-4000-8000-0000000049f1');
    raise exception 'FAIL: anon must not run team_away';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_away(null);
    raise exception 'FAIL: anon must not run set_away';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
