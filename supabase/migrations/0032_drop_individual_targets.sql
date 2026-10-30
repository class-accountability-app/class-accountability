-- =============================================================================
-- 0032_drop_individual_targets.sql — the end of personal targets
-- =============================================================================
-- The plan's last step (docs/plans/group-projects-plan.md, "teardown"), run
-- with the author's go-ahead of 2026-10-30, after the reset of that day left
-- no targets, logs, comments or documents to lose. Group projects replace
-- personal targets; the in-app editor already moved to tasks (0030).
--
-- 1. The research figures (0020/0021) are rebuilt on project activity before
--    the old tables go, with every suppression rule unchanged:
--      - a student is active in a week when they log task progress (by hand,
--        in the editor, or synced from Google) or share a check-in;
--      - logs_per_active_student_median counts those entries;
--      - "followed by a log within 48 h" means task progress or a check-in;
--      - document_targets_created becomes document_tasks_started (the week
--        of a document task's first editor entry), and checkins_shared is new.
--    The output changes shape, so research_weekly() is dropped and created
--    again. research_retention() keeps its shape. Delete earlier exports.
-- 2. The tables and functions of targets go: targets, progress_logs,
--    progress_comments, documents, document_versions, and the functions
--    that only they used. Their policies and triggers go with the tables.
--
-- Tests: supabase/tests/rls_research_metrics.sql (rewritten on tasks).
-- =============================================================================


-- 1. RESEARCH ON PROJECT ACTIVITY ---------------------------------------------

drop function private.research_weekly();

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
  document_tasks_started text,
  pct_active_students_writing text,
  checkins_shared text
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
students as (
  select m.user_id, min(m.joined_at) as first_join
  from public.class_memberships m
  where m.role = 'student'
    and not exists (select 1 from excluded x where x.user_id = m.user_id)
  group by m.user_id
),
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
-- Every entry a student made: task progress and check-ins. Counts only.
entries as (
  select p.user_id, p.logged_at as at_, p.source = 'document' as wrote
  from public.task_progress p
  union all
  select c.user_id, c.created_at, false
  from public.project_checkins c
),
active as (
  select w.week_start, e.user_id, count(*) as n_logs, bool_or(e.wrote) as wrote
  from weeks w
  join entries e on e.at_ >= w.t0 and e.at_ < w.t1
  join students s on s.user_id = e.user_id
  group by w.week_start, e.user_id
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
      select 1 from entries e
      where e.user_id = n.to_user_id
        and e.at_ > n.created_at
        and e.at_ <= n.created_at + interval '48 hours'
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
-- A document task starts with its first editor entry.
doc_starts as (
  select p.task_id, min(p.logged_at) as started, (array_agg(p.user_id order by p.logged_at))[1] as user_id
  from public.task_progress p
  where p.source = 'document'
  group by p.task_id
),
docs_w as (
  select w.week_start, count(*) as n_tasks, count(distinct d.user_id) as n_owners
  from weeks w
  join doc_starts d on d.started >= w.t0 and d.started < w.t1
  join students s on s.user_id = d.user_id
  group by w.week_start
),
checkins_w as (
  select w.week_start, count(*) as n_checkins, count(distinct c.user_id) as n_people
  from weeks w
  join public.project_checkins c on c.created_at >= w.t0 and c.created_at < w.t1
  join students s on s.user_id = c.user_id
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
  private.research_count(d.n_tasks, d.n_owners),
  private.research_pct(a.n_writing, a.n, a.n_writing, a.n - a.n_writing, 1),
  private.research_count(c.n_checkins, c.n_people)
from weeks w
left join active_w a using (week_start)
left join enrolled_w e using (week_start)
left join pods_w p using (week_start)
left join nudges_w nw using (week_start)
left join follow_w f using (week_start)
left join docs_w d using (week_start)
left join checkins_w c using (week_start)
order by w.week_start
$$;

revoke all on function private.research_weekly() from public, anon, authenticated;

create or replace function private.research_retention()
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
  select distinct e.user_id, date_trunc('week', e.at_ at time zone 'Asia/Tokyo')::date as w
  from (
    select p.user_id, p.logged_at as at_ from public.task_progress p
    union all
    select c.user_id, c.created_at from public.project_checkins c
  ) as e
  join students s on s.user_id = e.user_id
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

revoke all on function private.research_retention() from public, anon, authenticated;


-- 2. TEARDOWN -----------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.targets) or exists (select 1 from public.progress_logs)
     or exists (select 1 from public.documents) then
    raise exception 'targets, logs or documents still exist: refusing to drop them';
  end if;
end $$;

drop table public.document_versions;
drop table public.documents;
drop table public.progress_comments;
drop table public.progress_logs;
drop table public.targets;

drop function if exists public.save_document(uuid, integer, jsonb, integer, text);
drop function if exists public.keep_document_version(uuid, jsonb, integer);
drop function if exists public.keep_target_input_mode();
drop function if exists public.guard_document_progress();
drop function if exists public.can_see_target(uuid);
drop function if exists public.can_see_progress_log(uuid);
