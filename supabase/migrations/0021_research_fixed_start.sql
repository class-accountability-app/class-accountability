-- =============================================================================
-- 0021_research_fixed_start.sql — research_weekly() starts on a fixed Monday
-- =============================================================================
--
-- 0020 started the weekly table at the Tokyo week of the earliest counted
-- student's first class membership. With few students, that first date says
-- when one particular person joined. From now on the weeks start on a fixed
-- Monday, private.research_start() = 2026-09-28 (the start of the autumn
-- term), and run to the current week, whoever has joined. Logs, pods, nudges
-- and targets before that Monday are not counted; students who joined earlier
-- still count as enrolled.
--
-- research_retention() is unchanged: it outputs only N (1..12, every row
-- every time) and a percentage, never a date.
--
-- research_start() is its own function so the date lives in one place (and
-- the RLS test can move it inside its rolled-back transaction).
--
-- Tests: supabase/tests/rls_research_metrics.sql
-- =============================================================================

create function private.research_start()
returns date
language sql
immutable
set search_path = ''
as $$
  select date '2026-09-28'
$$;

revoke all on function private.research_start() from public, anon, authenticated;

create or replace function private.research_weekly()
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
-- Tokyo weeks, Monday 00:00 JST, from the fixed start (0021) to now.
weeks as (
  select ws::date as week_start,
         ws at time zone 'Asia/Tokyo' as t0,
         (ws + interval '7 days') at time zone 'Asia/Tokyo' as t1
  from generate_series(
    private.research_start()::timestamp,
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

revoke all on function private.research_weekly() from public, anon, authenticated;
