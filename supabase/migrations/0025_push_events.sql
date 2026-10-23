-- =============================================================================
-- 0025_push_events.sql — meeting reminders and stalled-task pushes
-- =============================================================================
-- Plan: docs/plans/automation-plan.md ("Push generalization", sections 2 and 3).
--
-- 0018 sends a push when a nudge arrives. This adds pushes the database owes a
-- student on a schedule:
--   meeting_reminder  a confirmed meeting (0024) starts within 24 hours; the
--                     text also asks to check in first when the student hasn't
--                     shared this round's check-in (0022)
--   task_stalled      one of my counted tasks has had no progress for 3 days;
--                     told to its OWNER ONLY, once per stall (teammates never)
--
-- push_events holds one row per push owed. The unique (user_id, kind, ref_key)
-- makes each reminder and each stall at most one row, however often the jobs
-- run. pg_cron fills it, then makes one signed call to the same Edge Function
-- as 0018 (private.call_push_function, body {"events": true}); the function
-- claims the unsent rows, sends them, and leaves them for the 07:00 flush
-- during quiet hours. Rows older than 12 hours are never sent.
--
-- WHO SEES WHAT: nobody but the Edge Function (admin key). RLS on, no policy,
-- no grant to anon or authenticated, as push_held_nudges in 0018. The queue
-- functions live in private and run only from pg_cron.
--
-- Every table has RLS enabled in this file (rule 1).
-- =============================================================================


-- =============================================================================
-- 1. TABLE
-- =============================================================================

create table public.push_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null,
  -- What makes this push one of a kind: the meeting and its start time, or
  -- the task and the moment its stall began.
  ref_key        text not null,
  poll_id        uuid references public.meeting_polls(id) on delete cascade,
  task_id        uuid references public.project_tasks(id) on delete cascade,
  needs_checkin  boolean not null default false,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  constraint push_events_kind_check check (kind in ('meeting_reminder', 'task_stalled')),
  constraint push_events_ref_check check (
    (kind = 'meeting_reminder' and poll_id is not null and task_id is null)
    or (kind = 'task_stalled' and task_id is not null and poll_id is null)
  ),
  constraint push_events_once unique (user_id, kind, ref_key)
);
alter table public.push_events enable row level security;
create index push_events_unsent_idx on public.push_events (created_at) where sent_at is null;

revoke all on public.push_events from public, anon, authenticated;


-- =============================================================================
-- 2. WHO IS OWED A PUSH (private; pg_cron only)
-- =============================================================================

-- Every member of the pod of a confirmed meeting that starts in 1–24 hours.
-- (Confirmed less than an hour before: the group already knows.) Returns how
-- many new rows were queued.
create or replace function private.queue_meeting_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, poll_id, needs_checkin)
  select pm.user_id,
         'meeting_reminder',
         mp.id::text || '@' || o.starts_at::text,
         mp.id,
         not exists (
           select 1 from public.project_checkins c
           where c.project_id = pr.id
             and c.user_id = pm.user_id
             and c.round_start = public.checkin_round_start(pr.start_date, pr.checkin_every_days, today)
         )
  from public.meeting_polls mp
  join public.meeting_poll_options o on o.id = mp.chosen_option_id
  join public.projects pr on pr.id = mp.project_id
  join public.pairing_members pm on pm.pairing_id = pr.pairing_id
  where mp.status = 'confirmed'
    and o.starts_at > now() + interval '1 hour'
    and o.starts_at <= now() + interval '24 hours'
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The owner of every counted task (not done, project not past its deadline)
-- whose last activity was 3 or more days ago. Activity: the task's creation,
-- its newest progress entry, or the last change its linked Google file made
-- (0023). The stall's start is in ref_key, so a task that moves and then
-- stalls again gets a new push, and the same stall never gets two.
create or replace function private.queue_stalled_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, task_id)
  select a.owner_id, 'task_stalled', a.id::text || '@' || a.last_at::text, a.id
  from (
    select t.id,
           t.owner_id,
           greatest(
             t.created_at,
             coalesce((select max(tp.logged_at) from public.task_progress tp where tp.task_id = t.id), t.created_at),
             coalesce((select s.last_changed_at from private.task_source_sync s where s.task_id = t.id), t.created_at)
           ) as last_at
    from public.project_tasks t
    join public.projects pr on pr.id = t.project_id
    where t.status <> 'done'
      and t.owner_id is not null
      and t.metric <> 'status'
      and (pr.deadline is null or pr.deadline >= today)
  ) a
  where a.last_at <= now() - interval '3 days'
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- One signed call to the Edge Function when something is waiting.
create or replace function private.send_push_events()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_events where sent_at is null) then
    perform private.call_push_function('{"events": true}'::jsonb);
  end if;
end;
$$;

revoke execute on function private.queue_meeting_reminders() from public, anon, authenticated;
revoke execute on function private.queue_stalled_tasks() from public, anon, authenticated;
revoke execute on function private.send_push_events() from public, anon, authenticated;


-- =============================================================================
-- 3. SCHEDULE (pg_cron runs in UTC; Japan has no daylight saving time)
-- =============================================================================

-- Every 15 minutes: meeting reminders.
select cron.schedule(
  'queue-meeting-reminders',
  '*/15 * * * *',
  $$select private.queue_meeting_reminders(); select private.send_push_events();$$
);

-- 09:00 JST: stalled tasks (outside quiet hours, so they go out at once).
select cron.schedule(
  'queue-stalled-task-pushes',
  '0 0 * * *',
  $$select private.queue_stalled_tasks(); select private.send_push_events();$$
);


-- =============================================================================
-- VERIFY: supabase/tests/rls_push_events.sql (expect 'all RLS tests passed'),
-- then rls_push_subscriptions.sql again. Deploy the Edge Function BEFORE
-- applying this migration (an old function answers {"events": true} with 400).
-- =============================================================================
