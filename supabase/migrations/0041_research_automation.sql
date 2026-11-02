-- =============================================================================
-- 0041_research_automation.sql — how much logging the automation does
-- (the author's ask of 2026-11-02, for the capstone write-up)
-- =============================================================================
--
-- private.research_automation(): one row per Tokyo week from
-- private.research_start() (0021), the same students as research_weekly()
-- (excluded users and organizers left out) and the same suppression rules
-- (0020): a count built on fewer than 5 students shows '<5'; a percentage
-- needs at least 5 students on both sides. Counts only: no ids, names,
-- emails, text or cell values.
--
--   entries_manual / entries_google / entries_editor
--       task_progress rows by source: ＋記録 by hand (manual), synced from
--       Google (google_docs, google_slides, google_sheets; logged under the
--       task's owner), and the in-app editor (document). Check-ins are in
--       research_weekly().
--   pct_active_with_google
--       of the students with any task progress that week, the share who had
--       a Google-synced entry.
--   google_links
--       Google links made that week (task_sources.linked_at, by the student
--       who linked; a link that was later removed is no longer counted).
--   polls_created / polls_confirmed
--       meeting polls created that week, and how many of those are confirmed
--       now (counted on the students who created them).
--
-- research_weekly() keeps its shape, so earlier exports stay comparable.
-- No grants to anon or authenticated: run it in the SQL editor.
-- Test: supabase/tests/rls_research_automation.sql.
-- =============================================================================

create function private.research_automation()
returns table (
  week_start date,
  week_complete boolean,
  entries_manual text,
  entries_google text,
  entries_editor text,
  pct_active_with_google text,
  google_links text,
  polls_created text,
  polls_confirmed text
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
  select distinct m.user_id
  from public.class_memberships m
  where m.role = 'student'
    and not exists (select 1 from excluded x where x.user_id = m.user_id)
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
entries as (
  select w.week_start, p.user_id,
    case when p.source = 'manual' then 'manual'
         when p.source = 'document' then 'editor'
         else 'google' end as kind
  from weeks w
  join public.task_progress p on p.logged_at >= w.t0 and p.logged_at < w.t1
  join students s on s.user_id = p.user_id
),
entries_w as (
  select e.week_start,
    count(*) filter (where e.kind = 'manual') as n_manual,
    count(distinct e.user_id) filter (where e.kind = 'manual') as p_manual,
    count(*) filter (where e.kind = 'google') as n_google,
    count(distinct e.user_id) filter (where e.kind = 'google') as p_google,
    count(*) filter (where e.kind = 'editor') as n_editor,
    count(distinct e.user_id) filter (where e.kind = 'editor') as p_editor,
    count(distinct e.user_id) as p_active
  from entries e
  group by e.week_start
),
links_w as (
  select w.week_start, count(*) as n, count(distinct ts.linked_by) as people
  from weeks w
  join public.task_sources ts on ts.linked_at >= w.t0 and ts.linked_at < w.t1
  join students s on s.user_id = ts.linked_by
  group by w.week_start
),
polls_w as (
  select w.week_start,
    count(*) as n, count(distinct mp.created_by) as people,
    count(*) filter (where mp.status = 'confirmed') as n_confirmed,
    count(distinct mp.created_by) filter (where mp.status = 'confirmed') as people_confirmed
  from weeks w
  join public.meeting_polls mp on mp.created_at >= w.t0 and mp.created_at < w.t1
  join students s on s.user_id = mp.created_by
  group by w.week_start
)
select
  w.week_start,
  w.week_start + 7 <= (now() at time zone 'Asia/Tokyo')::date,
  private.research_count(e.n_manual, e.p_manual),
  private.research_count(e.n_google, e.p_google),
  private.research_count(e.n_editor, e.p_editor),
  private.research_pct(e.p_google, e.p_active, e.p_google, e.p_active - e.p_google, 1),
  private.research_count(l.n, l.people),
  private.research_count(p.n, p.people),
  private.research_count(p.n_confirmed, p.people_confirmed)
from weeks w
left join entries_w e using (week_start)
left join links_w l using (week_start)
left join polls_w p using (week_start)
order by w.week_start
$$;

revoke all on function private.research_automation() from public, anon, authenticated;
