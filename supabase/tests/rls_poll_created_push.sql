-- =============================================================================
-- rls_poll_created_push.sql — tests for 0052 (a push when a poll is made)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B, C — class K, team F1 (A makes the poll)
--   D       — class K, team F2 (a classmate in another team)
--   O       — organizer of K
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000052a1', 'rls-test-pca@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000052b2', 'rls-test-pcb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000052c3', 'rls-test-pcc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000052d4', 'rls-test-pcd@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000052e5', 'rls-test-pco@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000052c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000052e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000052a1', '00000000-0000-4000-8000-00000052c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000052b2', '00000000-0000-4000-8000-00000052c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000052c3', '00000000-0000-4000-8000-00000052c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000052d4', '00000000-0000-4000-8000-00000052c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000052e5', '00000000-0000-4000-8000-00000052c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000052f1', '00000000-0000-4000-8000-00000052c1a5'),
  ('00000000-0000-4000-8000-0000000052f2', '00000000-0000-4000-8000-00000052c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000052f1', '00000000-0000-4000-8000-0000000052a1'),
  ('00000000-0000-4000-8000-0000000052f1', '00000000-0000-4000-8000-0000000052b2'),
  ('00000000-0000-4000-8000-0000000052f1', '00000000-0000-4000-8000-0000000052c3'),
  ('00000000-0000-4000-8000-0000000052f2', '00000000-0000-4000-8000-0000000052d4');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000520001', '00000000-0000-4000-8000-0000000052f1', 'Group talk',
   '00000000-0000-4000-8000-0000000052a1'),
  ('00000000-0000-4000-8000-000000520002', '00000000-0000-4000-8000-0000000052f2', 'Other group',
   '00000000-0000-4000-8000-0000000052d4');

-- The poll is made by A, through the only way clients make one.
create temporary table t_poll (id uuid) on commit drop;
grant all on t_poll to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000052a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  poll uuid;
begin
  poll := public.create_meeting_poll(
    '00000000-0000-4000-8000-000000520001', 'Midpoint check', 60, now() + interval '1 day',
    array[now() + interval '2 days', now() + interval '3 days']);
  if poll is null then
    raise exception 'FAIL: the poll must be made (a push must never stop it)';
  end if;
  insert into t_poll values (poll);

  -- Clients can neither read nor write push_events (0025).
  begin
    perform 1 from public.push_events;
    raise exception 'FAIL: a client must not read push_events';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.push_events (user_id, kind, ref_key, poll_id)
    values ('00000000-0000-4000-8000-0000000052b2', 'poll_created', poll::text, poll);
    raise exception 'FAIL: a client must not queue pushes';
  exception when insufficient_privilege then null;
  end;
end $$;

-- =============================================================================
-- As the database: exactly B and C were queued, once each
-- =============================================================================
reset role;
do $$
declare
  poll uuid := (select id from t_poll);
  got text;
begin
  select string_agg(right(user_id::text, 4), ',' order by user_id) into got
  from public.push_events where kind = 'poll_created' and poll_id = poll;
  if got is distinct from '52b2,52c3' then
    raise exception 'FAIL: poll pushes queued for %, expected 52b2,52c3 (teammates, not the maker, not another team, not the organizer)', got;
  end if;
  if exists (select 1 from public.push_events where kind = 'poll_created' and poll_id = poll and ref_key <> poll::text) then
    raise exception 'FAIL: ref_key must be the poll id, so each person is pushed once per poll';
  end if;

  -- Queuing again for the same poll adds nothing (unique user, kind, ref_key).
  insert into public.push_events (user_id, kind, ref_key, poll_id)
  values ('00000000-0000-4000-8000-0000000052b2', 'poll_created', poll::text, poll)
  on conflict (user_id, kind, ref_key) do nothing;
  if (select count(*) from public.push_events where kind = 'poll_created' and poll_id = poll) <> 2 then
    raise exception 'FAIL: a person must be pushed once per poll';
  end if;

  -- The check constraint: a poll push needs its poll and nothing else.
  begin
    insert into public.push_events (user_id, kind, ref_key)
    values ('00000000-0000-4000-8000-0000000052b2', 'poll_created', 'no-poll');
    raise exception 'FAIL: a poll push without a poll must be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_events (user_id, kind, ref_key, poll_id, project_id)
    values ('00000000-0000-4000-8000-0000000052c3', 'poll_created', 'both', poll,
            '00000000-0000-4000-8000-000000520001');
    raise exception 'FAIL: a poll push must not carry a project too';
  exception when check_violation then null;
  end;

  -- The kinds that were there before are still allowed.
  insert into public.push_events (user_id, kind, ref_key, poll_id)
  values ('00000000-0000-4000-8000-0000000052b2', 'poll_vote_due', 'still-ok', poll);
end $$;

-- A poll made in team F2 pushes nobody in F1.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000052d4","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.create_meeting_poll(
    '00000000-0000-4000-8000-000000520002', 'Solo team', 30, null,
    array[now() + interval '2 days', now() + interval '3 days']);
end $$;
reset role;
do $$
begin
  if exists (
    select 1 from public.push_events pe
    join public.meeting_polls mp on mp.id = pe.poll_id
    where pe.kind = 'poll_created' and mp.project_id = '00000000-0000-4000-8000-000000520002'
  ) then
    raise exception 'FAIL: a team of one has nobody to push (the maker is never pushed)';
  end if;
end $$;

-- A poll's pushes go with it: push_events.poll_id cascades (0025). Checked in
-- the catalog, so this file never removes a row (the dry-run rule).
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.push_events'::regclass and c.contype = 'f'
      and a.attname = 'poll_id' and c.confdeltype = 'c'
  ) then
    raise exception 'FAIL: push_events.poll_id must cascade, so pushes go with their poll';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
