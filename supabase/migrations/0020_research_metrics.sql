-- =============================================================================
-- 0020_research_metrics.sql — privacy-friendly research metrics (Prompt 13b)
-- =============================================================================
--
-- The privacy policy: research uses only aggregated, anonymized figures (never
-- names, emails, memos, comments or written text); for documents only character
-- counts; students can opt out by email. This migration adds:
--
-- 1. private.research_excluded_users: everyone left out of the figures, by
--    user id, with a reason: 'test' (test accounts), 'opt_out' (a student who
--    opted out by email) or 'other'. Filled only by the project owner with SQL
--    in the dashboard; never by the app, never by this migration. Students
--    can't see or change it: the private schema isn't exposed, and anon and
--    authenticated have no USAGE on it and no grant on the table. Nothing on
--    public.profiles changes.
--    Opting someone out (prints nothing):
--      insert into private.research_excluded_users (user_id, reason)
--      select id, 'opt_out' from auth.users where email = '<address>'
--      on conflict (user_id) do update set reason = 'opt_out';
-- 2. Organizers (any membership with role 'organizer', in any class) are
--    left out too, even if they are a student in another class.
-- 3. private.research_weekly() and private.research_retention(): counts per
--    Tokyo week (Monday 00:00 JST), never per person. They read no text column
--    and never documents or document_versions; they output no ids.
--
-- Small numbers:
--   A. A cell built on fewer than 5 students shows '<5'.
--   B. A ratio is shown only when both the students it counts and the rest
--      are 5 or more (so neither "who did" nor "who didn't" is a small group).
--   C. One dimension (the week), no parameters, no totals made of published
--      parts: two cells can't be subtracted to isolate someone.
--   D. Series that follow the same people week to week (pod share, push
--      opt-in, retention) show only percentages rounded to 5, no counts.
--   E. After any change to research_excluded_users, delete earlier exports
--      and export again: comparing old and new would reveal the removed
--      person's figures.
--
-- Run as the owner in the SQL editor, then export CSV:
--   select * from private.research_weekly();
--   select * from private.research_retention();
-- The functions are plain (security invoker): the owner reads every table
-- (postgres bypasses RLS), anyone else has no EXECUTE.
--
-- Known limits (the database keeps current state only): a pod someone left or
-- that was deleted, an unsubscribed device and a deleted account are not in
-- the history; a writing session counts as one log.
--
-- Tests: supabase/tests/rls_research_metrics.sql
-- =============================================================================


-- --- 1. Who is left out ------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.research_excluded_users (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  reason   text not null check (reason in ('test', 'opt_out', 'other')),
  added_at timestamptz not null default now()
);

alter table private.research_excluded_users enable row level security;
revoke all on private.research_excluded_users from public, anon, authenticated;


-- --- 2. Formatting with suppression ------------------------------------------

-- A count, shown only if it rests on at least 5 students (rule A).
create function private.research_count(n bigint, students bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(students, 0) < 5 then '<5' else coalesce(n, 0)::text end
$$;

-- A percentage num/den, shown only if the students in it (yes) and the rest
-- (no) are both at least 5 (rule B); rounded to `step` points (1, or 5 for
-- rule D).
create function private.research_pct(num bigint, den bigint, yes bigint, no bigint, step integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(yes, 0) < 5 or coalesce(no, 0) < 5 or coalesce(den, 0) = 0 then '<5'
    else (round(100.0 * num / den / step) * step)::integer::text || '%'
  end
$$;


-- --- 3. Weekly metrics -------------------------------------------------------

create function private.research_weekly()
returns table (
  week_start date,
  week_complete boolean,
  active_students text,
  logs_per_active_student_median text,
  pct_students_with_pod text,
  pods_formed text,
  nudges_sent text,
  pct_nudges_followed_by_log_48h text,
  pct_students_push_opt_in text,
  document_targets_created text,
  pct_active_students_writing text
)
language sql
stable
set search_path = ''
as $$
with
excluded as (
  select e.user_id from private.research_excluded_users e
  union
  select m.user_id from public.class_memberships m where m.role = 'organizer'
),
-- Counted students: a student in at least one class, not excluded. Their ids
-- never leave this function.
students as (
  select m.user_id, min(m.joined_at) as first_join
  from public.class_memberships m
  where m.role = 'student'
    and not exists (select 1 from excluded x where x.user_id = m.user_id)
  group by m.user_id
),
-- Tokyo weeks, Monday 00:00 JST, from the first student's first week to now.
weeks as (
  select ws::date as week_start,
         ws at time zone 'Asia/Tokyo' as t0,
         (ws + interval '7 days') at time zone 'Asia/Tokyo' as t1
  from generate_series(
    (select date_trunc('week', min(s.first_join) at time zone 'Asia/Tokyo') from students s),
    date_trunc('week', now() at time zone 'Asia/Tokyo'),
    interval '7 days'
  ) as ws
),
active as (
  select w.week_start, l.user_id, count(*) as n_logs, bool_or(l.source = 'document') as wrote
  from weeks w
  join public.progress_logs l on l.logged_at >= w.t0 and l.logged_at < w.t1
  join students s on s.user_id = l.user_id
  group by w.week_start, l.user_id
),
active_w as (
  select a.week_start, count(*) as n,
         percentile_cont(0.5) within group (order by a.n_logs) as median_logs,
         count(*) filter (where a.wrote) as n_writing
  from active a
  group by a.week_start
),
enrolled_w as (
  select w.week_start, count(*) as n,
    count(*) filter (where exists (
      select 1 from public.pairing_members pm
      where pm.user_id = s.user_id and pm.joined_at < w.t1)) as n_pod,
    count(*) filter (where exists (
      select 1 from public.push_subscriptions ps
      where ps.user_id = s.user_id and ps.created_at < w.t1)) as n_push
  from weeks w
  join students s on s.first_join < w.t1
  group by w.week_start
),
pods_w as (
  select w.week_start, count(distinct p.id) as n_pods, count(distinct pm.user_id) as n_people
  from weeks w
  join public.pairings p on p.created_at >= w.t0 and p.created_at < w.t1
  join public.pairing_members pm on pm.pairing_id = p.id
  join students s on s.user_id = pm.user_id
  group by w.week_start
),
nudges_c as (
  select n.id, n.from_user_id, n.to_user_id, n.created_at,
    exists (
      select 1 from public.progress_logs l
      where l.user_id = n.to_user_id
        and l.logged_at > n.created_at
        and l.logged_at <= n.created_at + interval '48 hours'
    ) as followed
  from public.nudges n
  where exists (select 1 from students s where s.user_id = n.from_user_id)
    and exists (select 1 from students s where s.user_id = n.to_user_id)
),
nudges_w as (
  select w.week_start, count(distinct n.id) as n_nudges, count(distinct who.user_id) as n_people
  from weeks w
  join nudges_c n on n.created_at >= w.t0 and n.created_at < w.t1
  cross join lateral (values (n.from_user_id), (n.to_user_id)) as who(user_id)
  group by w.week_start
),
follow_w as (
  -- Only nudges whose 48 hours are over.
  select w.week_start,
    count(*) as n_resolved,
    count(*) filter (where n.followed) as n_followed,
    count(distinct n.to_user_id) filter (where n.followed) as rcpt_followed,
    count(distinct n.to_user_id) filter (where not n.followed) as rcpt_not_followed
  from weeks w
  join nudges_c n on n.created_at >= w.t0 and n.created_at < w.t1
  where n.created_at <= now() - interval '48 hours'
  group by w.week_start
),
docs_w as (
  select w.week_start, count(*) as n_targets, count(distinct t.user_id) as n_owners
  from weeks w
  join public.targets t on t.created_at >= w.t0 and t.created_at < w.t1
  join students s on s.user_id = t.user_id
  where t.input_mode = 'document'
  group by w.week_start
)
select
  w.week_start,
  w.week_start + 7 <= (now() at time zone 'Asia/Tokyo')::date,
  private.research_count(a.n, a.n),
  case when coalesce(a.n, 0) < 5 then '<5' else round(a.median_logs::numeric, 1)::text end,
  private.research_pct(e.n_pod, e.n, e.n_pod, e.n - e.n_pod, 5),
  private.research_count(p.n_pods, p.n_people),
  private.research_count(nw.n_nudges, nw.n_people),
  private.research_pct(f.n_followed, f.n_resolved, f.rcpt_followed, f.rcpt_not_followed, 1),
  private.research_pct(e.n_push, e.n, e.n_push, e.n - e.n_push, 5),
  private.research_count(d.n_targets, d.n_owners),
  private.research_pct(a.n_writing, a.n, a.n_writing, a.n - a.n_writing, 1)
from weeks w
left join active_w a using (week_start)
left join enrolled_w e using (week_start)
left join pods_w p using (week_start)
left join nudges_w nw using (week_start)
left join follow_w f using (week_start)
left join docs_w d using (week_start)
order by w.week_start
$$;


-- --- 4. Retention ------------------------------------------------------------

-- Students who logged in their first week (the Tokyo week of their first
-- class membership): the share also active N weeks later, N = 1..12, counting
-- only students whose week N is over. Percentages rounded to 5 (rule D).
create function private.research_retention()
returns table (weeks_after_first integer, pct_still_active text)
language sql
stable
set search_path = ''
as $$
with
excluded as (
  select e.user_id from private.research_excluded_users e
  union
  select m.user_id from public.class_memberships m where m.role = 'organizer'
),
students as (
  select m.user_id, date_trunc('week', min(m.joined_at) at time zone 'Asia/Tokyo')::date as w0
  from public.class_memberships m
  where m.role = 'student'
    and not exists (select 1 from excluded x where x.user_id = m.user_id)
  group by m.user_id
),
active_weeks as (
  select distinct l.user_id, date_trunc('week', l.logged_at at time zone 'Asia/Tokyo')::date as w
  from public.progress_logs l
  join students s on s.user_id = l.user_id
),
cohort as (
  select s.user_id, s.w0
  from students s
  where exists (select 1 from active_weeks a where a.user_id = s.user_id and a.w = s.w0)
),
grid as (
  select g.n, c.user_id,
    exists (select 1 from active_weeks a where a.user_id = c.user_id and a.w = c.w0 + 7 * g.n) as active
  from generate_series(1, 12) as g(n)
  -- Week N (Monday w0 + 7N to w0 + 7N + 7) is over by today in Tokyo.
  join cohort c on c.w0 + 7 * (g.n + 1) <= (now() at time zone 'Asia/Tokyo')::date
)
select g.n,
  private.research_pct(
    count(x.user_id) filter (where x.active),
    count(x.user_id),
    count(x.user_id) filter (where x.active),
    count(x.user_id) filter (where not x.active),
    5)
from generate_series(1, 12) as g(n)
left join grid x on x.n = g.n
group by g.n
order by g.n
$$;


-- --- 5. Nobody but the owner -------------------------------------------------

revoke all on function private.research_count(bigint, bigint) from public, anon, authenticated;
revoke all on function private.research_pct(bigint, bigint, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function private.research_weekly() from public, anon, authenticated;
revoke all on function private.research_retention() from public, anon, authenticated;
