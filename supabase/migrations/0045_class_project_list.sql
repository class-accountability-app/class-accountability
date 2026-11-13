-- 0045: several class projects, several active projects per team
-- (the author's ask of 2026-11-13: "the teacher can put out more than one
-- project", several at once, the same teams for every project).
--
-- Before: one class_projects row per class (0029), and a team had at most one
-- active project (0033's partial unique index).
-- After:
--   * class_projects is a LIST per class (at most 10, SP020). Each row has its
--     own id; the organizer adds, edits and removes them with
--     add_class_project / update_class_project / delete_class_project
--     (set_class_project is gone).
--   * projects.class_project_id says which class project a team's project came
--     from (null = the team started it itself). Clients can't set or change it.
--   * Every team gets every class project: adding one gives it to each active
--     team that has a member, and a team's new member brings whatever the team
--     is still missing. A team never gets the same class project twice, also
--     not after finishing it.
--   * Editing a class project changes what teams get from then on; a team's
--     own copy is the team's and stays as it is. Removing a class project
--     leaves the teams' copies in place.
--   * A team may have several active projects (the app's switcher, PR #136).
--   * class_team_summary() returns one row per team and active project, with
--     the project's title (still no ids and no per-person numbers).
-- Test: supabase/tests/rls_class_project_list.sql (replaces rls_class_project.sql).

-- 1. THE LIST -------------------------------------------------------------------

alter table public.class_projects drop constraint class_projects_pkey;
alter table public.class_projects
  add column id uuid not null default gen_random_uuid(),
  add column created_at timestamptz not null default now();
alter table public.class_projects add primary key (id);
create index class_projects_class_idx on public.class_projects (class_id, created_at);

alter table public.projects
  add column class_project_id uuid references public.class_projects(id) on delete set null;

-- One copy of a class project per team, whatever its status.
create unique index projects_one_per_class_project
  on public.projects (pairing_id, class_project_id) where class_project_id is not null;

-- Projects that were started from the class project before today.
update public.projects pr
set class_project_id = cp.id
from public.pairings p
join public.class_projects cp on cp.class_id = p.class_id
where p.id = pr.pairing_id and pr.title = cp.title and pr.class_project_id is null;

-- Several active projects per team.
drop index public.projects_one_active_per_pod;

-- Only the database links a project to a class project.
create or replace function public.keep_class_project_link()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.class_project_id is not null then
      raise exception 'a project''s class project is set by the database' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.class_project_id is distinct from old.class_project_id then
      raise exception 'a project''s class project cannot change' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_class_project_link() from public, anon, authenticated;

create trigger projects_keep_class_project_link
  before insert or update on public.projects
  for each row execute function public.keep_class_project_link();


-- 2. GIVING A CLASS PROJECT TO A TEAM ---------------------------------------------

-- Creates the team's copy of one class project, unless the team already has
-- (or had) it. Same rules as 0029: no owners, due dates counted back from the
-- deadline and never before today, a past deadline left out, a task that
-- doesn't fit project_tasks' checks skipped with a warning.
create or replace function private.give_class_project(p_pod uuid, p_class_project uuid, p_creator uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cp        class_projects;
  today     date := (now() at time zone 'Asia/Tokyo')::date;
  new_proj  uuid;
  t         jsonb;
  i         integer := 0;
begin
  select * into cp from class_projects where id = p_class_project;
  if cp.id is null
     or exists (select 1 from projects where pairing_id = p_pod and class_project_id = cp.id) then
    return;
  end if;

  insert into projects (pairing_id, title, deadline, checkin_every_days, created_by, class_project_id)
  values (
    p_pod,
    cp.title,
    case when cp.deadline >= today then cp.deadline end,
    cp.checkin_every_days,
    p_creator,
    cp.id
  )
  returning id into new_proj;

  for t in select * from jsonb_array_elements(cp.tasks) loop
    i := i + 1;
    begin
      insert into project_tasks (project_id, title, metric, unit, target_amount, due, position)
      values (
        new_proj,
        t->>'title',
        coalesce(t->>'metric', 'status'),
        nullif(t->>'unit', ''),
        (t->>'target')::numeric,
        case when cp.deadline >= today and t ? 'days_before'
             then greatest(cp.deadline - (t->>'days_before')::integer, today) end,
        i
      );
    exception when others then
      raise warning 'class project %: skipped task % (%)', cp.id, i, sqlstate;
    end;
  end loop;
end;
$$;

revoke execute on function private.give_class_project(uuid, uuid, uuid) from public, anon, authenticated;

-- A team gets a member: bring every class project the team doesn't have yet.
create or replace function public.start_class_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cp_id uuid;
begin
  for cp_id in
    select c.id
    from pairings p
    join class_projects c on c.class_id = p.class_id
    where p.id = new.pairing_id and p.status = 'active'
    order by c.created_at, c.id
  loop
    begin
      perform private.give_class_project(new.pairing_id, cp_id, new.user_id);
    exception when others then
      -- Never block joining a team over a template.
      raise warning 'class project %: not started (%)', cp_id, sqlstate;
    end;
  end loop;
  return new;
exception when others then
  raise warning 'class projects for pod %: not started (%)', new.pairing_id, sqlstate;
  return new;
end;
$$;

revoke execute on function public.start_class_project() from public, anon, authenticated;


-- 3. THE ORGANIZER'S FUNCTIONS ------------------------------------------------------

drop function public.set_class_project(uuid, text, date, integer, jsonb);

-- Adds a project to the class's list and gives it to every active team that
-- has a member. Returns the new class project's id.
create or replace function public.add_class_project(
  p_class uuid, p_title text, p_deadline date, p_every integer, p_tasks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  pod    uuid;
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer adds a class project' using errcode = '42501';
  end if;
  -- One organizer at a time, so the limit below can't be passed by two tabs.
  perform 1 from classes where id = p_class for update;
  if (select count(*) from class_projects where class_id = p_class) >= 10 then
    raise exception 'a class has at most 10 projects' using errcode = 'SP020';
  end if;

  insert into class_projects (class_id, title, deadline, checkin_every_days, tasks)
  values (p_class, btrim(p_title), p_deadline, coalesce(p_every, 4), coalesce(p_tasks, '[]'::jsonb))
  returning id into new_id;

  for pod in
    select p.id from pairings p
    where p.class_id = p_class and p.status = 'active'
      and exists (select 1 from pairing_members pm where pm.pairing_id = p.id)
    order by p.created_at, p.id
  loop
    begin
      perform private.give_class_project(pod, new_id, null);
    exception when others then
      raise warning 'class project %: not given to pod % (%)', new_id, pod, sqlstate;
    end;
  end loop;

  return new_id;
end;
$$;

-- Changes what teams get from now on. Teams that already have it keep theirs.
create or replace function public.update_class_project(
  p_id uuid, p_title text, p_deadline date, p_every integer, p_tasks jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update class_projects cp
  set title = btrim(p_title), deadline = p_deadline, checkin_every_days = coalesce(p_every, 4),
      tasks = coalesce(p_tasks, '[]'::jsonb), updated_at = now()
  where cp.id = p_id and public.is_class_organizer(cp.class_id);
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

-- Takes it off the list. The teams' own copies stay (their link goes to null).
create or replace function public.delete_class_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from class_projects cp where cp.id = p_id and public.is_class_organizer(cp.class_id);
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.add_class_project(uuid, text, date, integer, jsonb) from public, anon;
revoke execute on function public.update_class_project(uuid, text, date, integer, jsonb) from public, anon;
revoke execute on function public.delete_class_project(uuid) from public, anon;
grant execute on function public.add_class_project(uuid, text, date, integer, jsonb) to authenticated;
grant execute on function public.update_class_project(uuid, text, date, integer, jsonb) to authenticated;
grant execute on function public.delete_class_project(uuid) to authenticated;


-- 4. THE ORGANIZER'S SUMMARY: ONE ROW PER TEAM AND ACTIVE PROJECT -------------------

-- Same body as 0033 plus project_title; a team with two active projects has
-- two rows, a team with none has one row with has_project = false.
-- class_milestone_status (0038) reads this function, so with several projects
-- it counts each team's project separately.
drop function public.class_team_summary(uuid);

create function public.class_team_summary(p_class uuid)
returns table (
  team_no integer,
  members integer,
  has_project boolean,
  start_date date,
  deadline date,
  task_count integer,
  percent integer,
  last_activity timestamptz,
  checkins_this_round integer,
  project_title text
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
    ) end,
    pr.title
  from pods
  left join active_projects pr on pr.pairing_id = pods.id
  left join per_project pp on pp.project_id = pr.id
  order by pods.team_no, pr.deadline nulls last, pr.created_at, pr.id;
$$;

revoke execute on function public.class_team_summary(uuid) from public, anon;
grant execute on function public.class_team_summary(uuid) to authenticated;
