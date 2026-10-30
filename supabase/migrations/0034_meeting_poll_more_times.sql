-- =============================================================================
-- 0034_meeting_poll_more_times.sql — more times per poll, and a reminder to
-- members who haven't answered (author's checklist of 2026-10-30, item D)
-- =============================================================================
--
-- 1. create_meeting_poll() takes 2–20 times (was 2–8; the form's week grid
--    makes picking many easy). Everything else about polls is unchanged.
-- 2. push_events kind 'poll_vote_due' (poll_id set): an open poll that a member
--    hasn't answered at all gets one push to that member, once per poll:
--      - with an answer-by time: when it is less than 12 hours away;
--      - without one: once the poll is a day old (and under 3 days, so an old
--        forgotten poll doesn't push).
--    pg_cron 'queue-poll-vote-reminders' every 30 minutes. Deploy the
--    send-nudge-push function that knows 'poll_vote_due' BEFORE this migration.
--    The push says only that a meeting poll is waiting, never its title.
--
-- Test: supabase/tests/rls_meeting_polls.sql and rls_push_events.sql still
-- pass; supabase/tests/rls_poll_vote_reminders.sql covers this file.
-- =============================================================================


-- 1. UP TO 20 TIMES -------------------------------------------------------------

create or replace function public.create_meeting_poll(
  p_project   uuid,
  p_title     text,
  p_duration  integer,
  p_vote_by   timestamptz,
  p_starts    timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  n       integer := coalesce(cardinality(p_starts), 0);
  new_id  uuid;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.is_project_member(p_project) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  if n < 2 or n > 20
     or (select count(distinct s) from unnest(p_starts) s) <> n
     or exists (select 1 from unnest(p_starts) s where s is null or s <= now()) then
    raise exception 'suggest 2 to 20 different times in the future' using errcode = 'SP013';
  end if;
  if p_vote_by is not null and p_vote_by <= now() then
    raise exception 'the answer-by time has passed' using errcode = 'SP013';
  end if;

  insert into meeting_polls (project_id, created_by, title, duration_minutes, vote_by)
  values (p_project, me, btrim(p_title), coalesce(p_duration, 30), p_vote_by)
  returning id into new_id;

  insert into meeting_poll_options (poll_id, starts_at)
  select new_id, s from unnest(p_starts) s;

  return new_id;
end;
$$;


-- 2. REMIND MEMBERS WHO HAVEN'T ANSWERED ----------------------------------------

alter table public.push_events drop constraint push_events_kind_check;
alter table public.push_events add constraint push_events_kind_check
  check (kind in ('meeting_reminder', 'task_stalled', 'checkin_due', 'poll_vote_due'));

alter table public.push_events drop constraint push_events_ref_check;
alter table public.push_events add constraint push_events_ref_check check (
  (kind in ('meeting_reminder', 'poll_vote_due') and poll_id is not null and task_id is null and project_id is null)
  or (kind = 'task_stalled' and task_id is not null and poll_id is null and project_id is null)
  or (kind = 'checkin_due' and project_id is not null and poll_id is null and task_id is null)
);

create or replace function private.queue_poll_vote_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, poll_id)
  select pm.user_id, 'poll_vote_due', p.id::text, p.id
  from public.meeting_polls p
  join public.projects pr on pr.id = p.project_id and pr.status = 'active'
  join public.pairing_members pm on pm.pairing_id = pr.pairing_id
  where p.status = 'open'
    -- Someone can still answer something useful: a time in the future.
    and exists (select 1 from public.meeting_poll_options o where o.poll_id = p.id and o.starts_at > now())
    and (
      (p.vote_by is not null and p.vote_by > now() and p.vote_by <= now() + interval '12 hours')
      or (p.vote_by is null and p.created_at <= now() - interval '1 day' and p.created_at > now() - interval '3 days')
    )
    -- The person who made the poll is not reminded about it.
    and pm.user_id is distinct from p.created_by
    and not exists (
      select 1 from public.meeting_poll_votes v
      join public.meeting_poll_options o on o.id = v.option_id
      where o.poll_id = p.id and v.user_id = pm.user_id
    )
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.queue_poll_vote_reminders() from public, anon, authenticated;

select cron.schedule(
  'queue-poll-vote-reminders',
  '*/30 * * * *',
  $$select private.queue_poll_vote_reminders(); select private.send_push_events();$$
);
