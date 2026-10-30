-- =============================================================================
-- 0033_project_lifecycle.sql — finish a project, start the next, and a
-- reminder on check-in day (author's checklist of 2026-10-30, item B).
-- =============================================================================
--
-- 1. projects.status: 'active' or 'done' (+ finished_at). A pod has at most one
--    active project (a unique index on pairing_id where active, replacing
--    0022's unique pairing_id), so a team can finish one and start the next.
--    finish_project(project) is for any member. A finished project is history:
--    signed-in users can't add or change its tasks, log progress, check in or
--    open a meeting poll (SP016). The check uses auth.uid(), so it also covers
--    security-definer functions called by a student (submit_checkin,
--    create_meeting_poll); the Google sync (service_role) and cascades pass,
--    and so does unassigning a leaver's tasks.
-- 2. The organizer's summary (0027) counts active projects only.
-- 3. push_events gets kind 'checkin_due' (+ project_id): on the last Tokyo day
--    of a check-in round, a member of an active project who hasn't checked in
--    this round gets one push (pg_cron, 09:05 JST). Deploy the send-nudge-push
--    function that knows 'checkin_due' BEFORE this migration.
--
-- Error code: SP016 (lib/errors.ts). Test: supabase/tests/rls_project_lifecycle.sql.
-- =============================================================================


-- 1. STATUS ------------------------------------------------------------------

alter table public.projects
  add column status text not null default 'active',
  add column finished_at timestamptz,
  add constraint projects_status_check check (status in ('active', 'done')),
  add constraint projects_finished_at_check check ((status = 'done') = (finished_at is not null));

alter table public.projects drop constraint projects_pairing_id_key;
create unique index projects_one_active_per_pod on public.projects (pairing_id) where status = 'active';
create index projects_pairing_idx on public.projects (pairing_id);

create or replace function public.finish_project(p_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_project_member(p_project) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  update projects set status = 'done', finished_at = now()
  where id = p_project and status = 'active';
end;
$$;

revoke execute on function public.finish_project(uuid) from public, anon;
grant execute on function public.finish_project(uuid) to authenticated;

-- Students can't flip status themselves (only finish_project does it).
create or replace function public.keep_project_status()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.status is distinct from old.status or new.finished_at is distinct from old.finished_at) then
    raise exception 'use finish_project' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_project_status() from public, anon, authenticated;

create trigger projects_keep_status
  before update on public.projects
  for each row execute function public.keep_project_status();

-- A finished project is read-only for signed-in users.
create or replace function public.guard_finished_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- Leaving the team (0022) or deleting an account unassigns tasks: allowed.
  -- (Through to_jsonb: plpgsql would resolve new.owner_id on every table.)
  if tg_table_name = 'project_tasks' and tg_op = 'UPDATE' then
    if to_jsonb(new) ->> 'owner_id' is null
       and to_jsonb(new) - 'owner_id' - 'updated_at' = to_jsonb(old) - 'owner_id' - 'updated_at' then
      return new;
    end if;
  end if;
  if tg_table_name = 'task_progress' then
    select project_id into proj from project_tasks where id = new.task_id;
  else
    proj := new.project_id;
  end if;
  if exists (select 1 from projects where id = proj and status = 'done') then
    raise exception 'this project is finished' using errcode = 'SP016';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_finished_project() from public, anon, authenticated;

create trigger project_tasks_guard_finished
  before insert or update on public.project_tasks
  for each row execute function public.guard_finished_project();
create trigger task_progress_guard_finished
  before insert or update on public.task_progress
  for each row execute function public.guard_finished_project();
create trigger project_checkins_guard_finished
  before insert on public.project_checkins
  for each row execute function public.guard_finished_project();
create trigger meeting_polls_guard_finished
  before insert on public.meeting_polls
  for each row execute function public.guard_finished_project();


-- 2. THE ORGANIZER'S SUMMARY: ACTIVE PROJECTS ONLY -----------------------------

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
  active_projects as (
    select pr.* from projects pr join pods on pods.id = pr.pairing_id where pr.status = 'active'
  ),
  task_totals as (
    select t.project_id, t.id, t.metric, t.status, t.target_amount,
           coalesce(sum(tp.progress_value), 0) as total, max(tp.logged_at) as last_logged
    from project_tasks t
    join active_projects pr on pr.id = t.project_id
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
  left join active_projects pr on pr.pairing_id = pods.id
  left join per_project pp on pp.project_id = pr.id
  order by pods.team_no;
$$;


-- 3. CHECK-IN DAY REMINDER ------------------------------------------------------

alter table public.push_events
  add column project_id uuid references public.projects(id) on delete cascade;

alter table public.push_events drop constraint push_events_kind_check;
alter table public.push_events add constraint push_events_kind_check
  check (kind in ('meeting_reminder', 'task_stalled', 'checkin_due'));

alter table public.push_events drop constraint push_events_ref_check;
alter table public.push_events add constraint push_events_ref_check check (
  (kind = 'meeting_reminder' and poll_id is not null and task_id is null and project_id is null)
  or (kind = 'task_stalled' and task_id is not null and poll_id is null and project_id is null)
  or (kind = 'checkin_due' and project_id is not null and poll_id is null and task_id is null)
);

-- Members of an active project (not past its deadline) whose check-in round
-- ends today, Tokyo time, and who haven't checked in this round.
create or replace function private.queue_checkin_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, project_id)
  select pm.user_id,
         'checkin_due',
         pr.id::text || '@' || public.checkin_round_start(pr.start_date, pr.checkin_every_days, today)::text,
         pr.id
  from public.projects pr
  join public.pairing_members pm on pm.pairing_id = pr.pairing_id
  where pr.status = 'active'
    and (pr.deadline is null or pr.deadline >= today)
    and today >= pr.start_date
    and public.checkin_round_start(pr.start_date, pr.checkin_every_days, today) + pr.checkin_every_days - 1 = today
    and not exists (
      select 1 from public.project_checkins c
      where c.project_id = pr.id
        and c.user_id = pm.user_id
        and c.round_start = public.checkin_round_start(pr.start_date, pr.checkin_every_days, today)
    )
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.queue_checkin_reminders() from public, anon, authenticated;

-- 09:05 JST, after the stalled-task pushes at 09:00.
select cron.schedule(
  'queue-checkin-reminders',
  '5 0 * * *',
  $$select private.queue_checkin_reminders(); select private.send_push_events();$$
);
