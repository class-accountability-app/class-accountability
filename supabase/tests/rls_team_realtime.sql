-- =============================================================================
-- rls_team_realtime.sql — tests for 0051 (live presence on team:<pod> channels)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Realtime decides what a client may do on a channel by running the policies
-- on realtime.messages with realtime.topic() set; both policies call
-- team_channel_allowed(topic, extension, send). This file checks the function
-- for every kind of user and that both policies exist and call it.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, pod F1 (B has 「オンライン表示」 off)
--   C    — class K, pod F2 (a classmate, not a teammate)
--   O    — organizer of K
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000051a1', 'rls-test-rta@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000051b2', 'rls-test-rtb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000051c3', 'rls-test-rtc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000051e5', 'rls-test-rto@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000051c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000051e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-00000051c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000051b2', '00000000-0000-4000-8000-00000051c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000051c3', '00000000-0000-4000-8000-00000051c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000051e5', '00000000-0000-4000-8000-00000051c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000051f1', '00000000-0000-4000-8000-00000051c1a5'),
  ('00000000-0000-4000-8000-0000000051f2', '00000000-0000-4000-8000-00000051c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000051f1', '00000000-0000-4000-8000-0000000051a1'),
  ('00000000-0000-4000-8000-0000000051f1', '00000000-0000-4000-8000-0000000051b2'),
  ('00000000-0000-4000-8000-0000000051f2', '00000000-0000-4000-8000-0000000051c3');

-- B turned 「オンライン表示」 off; A has no presence row yet (the default: on).
insert into public.member_presence (user_id, share_online) values
  ('00000000-0000-4000-8000-0000000051b2', false);

-- =============================================================================
-- Both policies exist on realtime.messages and call the helper
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and cmd = 'SELECT'
      and 'authenticated' = any (roles)
      and qual like '%team_channel_allowed%'
  ) then
    raise exception 'FAIL: the select policy on realtime.messages is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and cmd = 'INSERT'
      and 'authenticated' = any (roles)
      and with_check like '%team_channel_allowed%'
  ) then
    raise exception 'FAIL: the insert policy on realtime.messages is missing';
  end if;
end $$;

-- =============================================================================
-- As A: a member of F1 with sharing on (no row: the default)
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000051a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', false) then
    raise exception 'FAIL: A must be able to join and listen on their own team';
  end if;
  if not public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', true) then
    raise exception 'FAIL: A (sharing on by default) must be able to announce themselves';
  end if;
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f2', 'presence', false) then
    raise exception 'FAIL: A must not listen on another team';
  end if;
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f2', 'presence', true) then
    raise exception 'FAIL: A must not announce themselves on another team';
  end if;
  -- Presence only: no broadcast (no chat) on a team topic, read or write.
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'broadcast', false)
     or public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'broadcast', true)
     or public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', null, false) then
    raise exception 'FAIL: only presence is allowed on a team channel';
  end if;
  -- Anything that isn't exactly team:<uuid> is refused, without an error.
  if public.team_channel_allowed('team:not-a-uuid', 'presence', false)
     or public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1x', 'presence', false)
     or public.team_channel_allowed('room:00000000-0000-4000-8000-0000000051f1', 'presence', false)
     or public.team_channel_allowed('TEAM:00000000-0000-4000-8000-0000000051f1', 'presence', false)
     or public.team_channel_allowed('', 'presence', false)
     or public.team_channel_allowed(null, 'presence', false) then
    raise exception 'FAIL: a malformed topic must be refused';
  end if;
end $$;

-- A turns sharing off: still listens, no longer announces.
do $$
begin
  perform public.set_online_sharing(false);
  if not public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', false) then
    raise exception 'FAIL: A with sharing off must still be able to listen';
  end if;
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', true) then
    raise exception 'FAIL: A with sharing off must not announce themselves';
  end if;
  perform public.set_online_sharing(true);
  if not public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', true) then
    raise exception 'FAIL: A with sharing back on must announce themselves again';
  end if;
end $$;

-- =============================================================================
-- As B: a member of F1 with sharing off
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000051b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', false) then
    raise exception 'FAIL: B (sharing off) must still see who else is here';
  end if;
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', true) then
    raise exception 'FAIL: B (sharing off) must not announce themselves';
  end if;
end $$;

-- =============================================================================
-- As C: a classmate in another team
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000051c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', false)
     or public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', true) then
    raise exception 'FAIL: a classmate must not join another team''s channel';
  end if;
  if not public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f2', 'presence', true) then
    raise exception 'FAIL: C must be able to use their own team''s channel';
  end if;
end $$;

-- =============================================================================
-- As O: the class's organizer (never in a team, 0015)
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000051e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', false)
     or public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f2', 'presence', false) then
    raise exception 'FAIL: an organizer must not see a team''s live presence';
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
    perform public.team_channel_allowed('team:00000000-0000-4000-8000-0000000051f1', 'presence', false);
    raise exception 'FAIL: anon must not run team_channel_allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
