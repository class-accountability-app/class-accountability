-- 0027: project first (plan docs/plans/project-first-plan.md, decided 2026-10-30).
--
-- Two read-only functions, nothing else changes:
--
-- 1. project_task_totals(project): every task's live total and when it last
--    changed, for any member of the project's pod. Teammates now see each
--    other's numbers at any time, not only in check-ins. Only sums leave the
--    function: the task_progress rows themselves (and the personal note on
--    each) stay readable only by the logger and the task's owner (0022), and
--    a document's text stays its owner's alone (0019).
--
-- 2. class_team_summary(class): for the class's organizer only, one row per
--    active pod: a team number, member count, whether a project exists, its
--    dates, % done, last activity and check-ins shared this round. No user
--    ids, names, task titles or per-person numbers.
--
-- Both are security definer (they read past RLS) and check the caller first;
-- execute is granted to authenticated only.

-- =============================================================================
-- 1. Live totals for the pod
-- =============================================================================
create or replace function public.project_task_totals(p_project uuid)
returns table (task_id uuid, total numeric, last_logged_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, coalesce(sum(tp.progress_value), 0), max(tp.logged_at)
  from project_tasks t
  left join task_progress tp on tp.task_id = t.id
  where t.project_id = p_project
    and public.is_project_member(p_project)
  group by t.id;
$$;

-- =============================================================================
-- 2. The organizer's per-team summary
-- =============================================================================
-- % done uses the same rule as lib/project-stats.ts taskFraction(): done is
-- 1; a counted task with a goal is total / goal (0..1); otherwise doing is
-- 0.5 and todo 0. Every task weighs the same; no tasks is 0.
create or replace function public.class_team_summary(p_class uuid)
returns table (
  team_no integer,
  members integer,
  has_project boolean,
  start_date date,
  deadline date,
  task_count integer,
  percent integer,
  last_activity timestamptz,
  checkins_this_round integer
)
language sql
security definer
set search_path = public
stable
as $$
  with caller_is_organizer as (
    select exists (
      select 1 from class_memberships cm
      where cm.class_id = p_class and cm.user_id = auth.uid() and cm.role = 'organizer'
    ) as ok
  ),
  pods as (
    select p.id, row_number() over (order by p.created_at, p.id)::integer as team_no
    from pairings p
    where p.class_id = p_class and p.status = 'active'
      and (select ok from caller_is_organizer)
  ),
  task_totals as (
    select t.project_id, t.id, t.metric, t.status, t.target_amount,
           coalesce(sum(tp.progress_value), 0) as total, max(tp.logged_at) as last_logged
    from project_tasks t
    join projects pr on pr.id = t.project_id
    join pods on pods.id = pr.pairing_id
    left join task_progress tp on tp.task_id = t.id
    group by t.id
  ),
  per_project as (
    select project_id,
           count(*)::integer as task_count,
           round(100 * avg(
             case
               when status = 'done' then 1
               when metric <> 'status' and target_amount is not null then least(greatest(total / target_amount, 0), 1)
               when status = 'doing' then 0.5
               else 0
             end
           ))::integer as percent,
           max(last_logged) as last_logged
    from task_totals
    group by project_id
  )
  select
    pods.team_no,
    (select count(*)::integer from pairing_members pm where pm.pairing_id = pods.id),
    pr.id is not null,
    pr.start_date,
    pr.deadline,
    coalesce(pp.task_count, 0),
    coalesce(pp.percent, 0),
    greatest(pp.last_logged, (select max(c.created_at) from project_checkins c where c.project_id = pr.id)),
    case when pr.id is null then 0 else (
      select count(*)::integer from project_checkins c
      where c.project_id = pr.id
        and c.round_start = public.checkin_round_start(
          pr.start_date, pr.checkin_every_days, (now() at time zone 'Asia/Tokyo')::date)
    ) end
  from pods
  left join projects pr on pr.pairing_id = pods.id
  left join per_project pp on pp.project_id = pr.id
  order by pods.team_no;
$$;

revoke execute on function public.project_task_totals(uuid) from public, anon;
revoke execute on function public.class_team_summary(uuid) from public, anon;
grant execute on function public.project_task_totals(uuid) to authenticated;
grant execute on function public.class_team_summary(uuid) to authenticated;
