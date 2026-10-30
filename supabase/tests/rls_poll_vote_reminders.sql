-- =============================================================================
-- rls_poll_vote_reminders.sql — tests for 0034 (reminder to members who
-- haven't answered a meeting poll)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): A (made the polls), B, C — class K, pod F1, project P.
-- Polls (made by A, created_at set by the table owner):
--   SOON  vote_by in 6 hours        → B and C reminded, A never (the maker)
--   LATER vote_by in 3 days         → nobody yet
--   OLD   no vote_by, 30 hours old  → reminded
--   NEW   no vote_by, 2 hours old   → nobody yet
--   DONE  confirmed                 → nobody
-- B answers SOON before the queue runs → only C is reminded about SOON.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000034a1', 'rls-test-va@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000034b2', 'rls-test-vb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000034c3', 'rls-test-vc@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000034c1a5', 'RLS test class K', 'Test', 'test',
   '00000000-0000-4000-8000-0000000034a1');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000034a1', '00000000-0000-4000-8000-00000034c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000034b2', '00000000-0000-4000-8000-00000034c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000034c3', '00000000-0000-4000-8000-00000034c1a5', 'student');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000034f1', '00000000-0000-4000-8000-00000034c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000034f1', '00000000-0000-4000-8000-0000000034a1'),
  ('00000000-0000-4000-8000-0000000034f1', '00000000-0000-4000-8000-0000000034b2'),
  ('00000000-0000-4000-8000-0000000034f1', '00000000-0000-4000-8000-0000000034c3');

insert into public.projects (id, pairing_id, title, created_by) values
  ('00000000-0000-4000-8000-000000340001', '00000000-0000-4000-8000-0000000034f1', 'P',
   '00000000-0000-4000-8000-0000000034a1');

insert into public.meeting_polls (id, project_id, created_by, title, vote_by, created_at) values
  ('00000000-0000-4000-8000-0000003401a1', '00000000-0000-4000-8000-000000340001',
   '00000000-0000-4000-8000-0000000034a1', 'SOON', now() + interval '6 hours', now()),
  ('00000000-0000-4000-8000-0000003401a2', '00000000-0000-4000-8000-000000340001',
   '00000000-0000-4000-8000-0000000034a1', 'LATER', now() + interval '3 days', now()),
  ('00000000-0000-4000-8000-0000003401a3', '00000000-0000-4000-8000-000000340001',
   '00000000-0000-4000-8000-0000000034a1', 'OLD', null, now() - interval '30 hours'),
  ('00000000-0000-4000-8000-0000003401a4', '00000000-0000-4000-8000-000000340001',
   '00000000-0000-4000-8000-0000000034a1', 'NEW', null, now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000003401a5', '00000000-0000-4000-8000-000000340001',
   '00000000-0000-4000-8000-0000000034a1', 'DONE', null, now() - interval '30 hours');

insert into public.meeting_poll_options (id, poll_id, starts_at)
select gen_random_uuid(), p.id, now() + make_interval(days => g)
from public.meeting_polls p, generate_series(4, 5) g
where p.project_id = '00000000-0000-4000-8000-000000340001';

update public.meeting_polls set status = 'confirmed',
  chosen_option_id = (select id from public.meeting_poll_options where poll_id = '00000000-0000-4000-8000-0000003401a5' limit 1)
where id = '00000000-0000-4000-8000-0000003401a5';

-- B answers SOON (as B, through RLS).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000034b2","role":"authenticated"}', true);
set local role authenticated;
insert into public.meeting_poll_votes (option_id, user_id, answer)
select id, '00000000-0000-4000-8000-0000000034b2', 'yes'
from public.meeting_poll_options where poll_id = '00000000-0000-4000-8000-0000003401a1' limit 1;
reset role;

do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000034a1';
  b constant uuid := '00000000-0000-4000-8000-0000000034b2';
  c constant uuid := '00000000-0000-4000-8000-0000000034c3';
  got text;
begin
  perform private.queue_poll_vote_reminders();

  select string_agg(p.title || ':' || case e.user_id when a then 'A' when b then 'B' when c then 'C' end, ',' order by p.title, e.user_id)
  into got
  from public.push_events e join public.meeting_polls p on p.id = e.poll_id
  where e.kind = 'poll_vote_due' and p.project_id = '00000000-0000-4000-8000-000000340001';

  -- OLD: B and C (A made it). SOON: only C (B answered, A made it).
  if got is distinct from 'OLD:B,OLD:C,SOON:C' then
    raise exception 'FAIL: poll reminders queued %, expected OLD:B,OLD:C,SOON:C', got;
  end if;

  -- Once per poll per person.
  perform private.queue_poll_vote_reminders();
  if (select count(*) from public.push_events e join public.meeting_polls p on p.id = e.poll_id
      where e.kind = 'poll_vote_due' and p.project_id = '00000000-0000-4000-8000-000000340001') <> 3 then
    raise exception 'FAIL: a second run must not queue the same reminder again';
  end if;

  -- The kind needs a poll and nothing else.
  begin
    insert into public.push_events (user_id, kind, ref_key, task_id)
    values (c, 'poll_vote_due', 'x', null);
    raise exception 'FAIL: poll_vote_due without a poll must be refused';
  exception when check_violation then null;
  end;
end $$;

-- Students can't run the queue.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000034c3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform private.queue_poll_vote_reminders();
  raise exception 'FAIL: a student must not run queue_poll_vote_reminders';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
