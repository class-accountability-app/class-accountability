-- =============================================================================
-- rls_team_presence.sql — tests for 0035 (team table: online now, last day seen)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, pod F1
--   C    — class K, pod F2 (a classmate, not a teammate)
--   O    — organizer of K
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000035a1', 'rls-test-pra@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000035b2', 'rls-test-prb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000035c3', 'rls-test-prc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000035e5', 'rls-test-pro@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000035c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000035e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000035a1', '00000000-0000-4000-8000-00000035c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000035b2', '00000000-0000-4000-8000-00000035c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000035c3', '00000000-0000-4000-8000-00000035c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000035e5', '00000000-0000-4000-8000-00000035c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000035f1', '00000000-0000-4000-8000-00000035c1a5'),
  ('00000000-0000-4000-8000-0000000035f2', '00000000-0000-4000-8000-00000035c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000035f1', '00000000-0000-4000-8000-0000000035a1'),
  ('00000000-0000-4000-8000-0000000035f1', '00000000-0000-4000-8000-0000000035b2'),
  ('00000000-0000-4000-8000-0000000035f2', '00000000-0000-4000-8000-0000000035c3');

-- =============================================================================
-- As A: pings; reads only their own row; can't write rows directly
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000035a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  perform public.touch_presence();
  perform public.touch_presence(); -- twice in a row is fine
  if (select count(*) from public.member_presence) <> 1 then
    raise exception 'FAIL: A should read exactly their own presence row';
  end if;
  begin
    insert into public.member_presence (user_id) values ('00000000-0000-4000-8000-0000000035b2');
    raise exception 'FAIL: a client must not write presence rows';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.member_presence set last_seen_at = now() - interval '9 days';
    raise exception 'FAIL: a client must not update presence directly';
  exception when insufficient_privilege then null;
  end;

  select * into r from public.team_presence('00000000-0000-4000-8000-0000000035f1')
  where user_id = '00000000-0000-4000-8000-0000000035a1';
  if not r.online or r.last_seen_day is distinct from (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'FAIL: A should be online today: %', r;
  end if;
  select * into r from public.team_presence('00000000-0000-4000-8000-0000000035f1')
  where user_id = '00000000-0000-4000-8000-0000000035b2';
  if r.online or r.last_seen_day is not null then
    raise exception 'FAIL: B has never opened the app: %', r;
  end if;
end $$;

-- =============================================================================
-- As B: pings, then turns the online dot off
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000035b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.touch_presence();
  perform public.set_online_sharing(false);
  if (select share_online from public.member_presence) then
    raise exception 'FAIL: B''s sharing should be off';
  end if;
end $$;

-- A sees B: not online (sharing off), but today as the day last seen.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000035a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.team_presence('00000000-0000-4000-8000-0000000035f1')
  where user_id = '00000000-0000-4000-8000-0000000035b2';
  if r.online or r.last_seen_day is distinct from (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'FAIL: B (sharing off) should show today, not online: %', r;
  end if;
end $$;

-- A's last visit 10 minutes ago: no longer online; a ping updates it again.
reset role;
update public.member_presence set last_seen_at = now() - interval '10 minutes'
where user_id = '00000000-0000-4000-8000-0000000035a1';
set local role authenticated;
do $$
begin
  if (select online from public.team_presence('00000000-0000-4000-8000-0000000035f1')
      where user_id = '00000000-0000-4000-8000-0000000035a1') then
    raise exception 'FAIL: 10 minutes without a ping is not online';
  end if;
  perform public.touch_presence();
  if not (select online from public.team_presence('00000000-0000-4000-8000-0000000035f1')
          where user_id = '00000000-0000-4000-8000-0000000035a1') then
    raise exception 'FAIL: a new ping should make A online again';
  end if;
end $$;

-- =============================================================================
-- As C (classmate in another team) and O (organizer): nothing
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000035c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.team_presence('00000000-0000-4000-8000-0000000035f1')) then
    raise exception 'FAIL: a classmate in another team must not see F1''s presence';
  end if;
  if exists (select 1 from public.member_presence) then
    raise exception 'FAIL: C must not read anyone else''s presence row';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000035e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.team_presence('00000000-0000-4000-8000-0000000035f1')) then
    raise exception 'FAIL: an organizer must not see a team''s presence';
  end if;
end $$;

-- =============================================================================
-- Logged out
-- =============================================================================
reset role;
set local role anon;
do $$
begin
  begin
    perform public.team_presence('00000000-0000-4000-8000-0000000035f1');
    raise exception 'FAIL: anon must not run team_presence';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.touch_presence();
    raise exception 'FAIL: anon must not run touch_presence';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.member_presence;
    raise exception 'FAIL: anon must not read member_presence';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
