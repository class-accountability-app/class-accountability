-- 0029: the class project (project first, decided 2026-10-30).
--
-- An organizer sets one project for the whole class (e.g. 最終発表, due
-- 2026-12-18, with presentation tasks). Every team in that class starts with
-- it: when a pod gets its first member and has no project yet, a trigger
-- creates the project and its tasks (no owners; students pick them with
-- 担当する). The organizer still sees nothing of the teams beyond 0027's
-- summary: the trigger runs as the definer, and the project belongs to the pod.
--
-- class_projects: one row per class. Class members (students and the
-- organizer) read it; it is written only through set_class_project(), by the
-- class's organizer. `tasks` is a JSON array of
--   { "title", "metric": status|count|characters, "unit", "target", "days_before" }
-- where days_before counts each task's due date back from the deadline.
--
-- A broken template must never stop anyone from joining a team, so the
-- trigger skips (with a warning in the logs) whatever doesn't fit
-- project_tasks' own checks, and a deadline already past is left out.
-- Test: supabase/tests/rls_class_project.sql.

create table public.class_projects (
  class_id            uuid primary key references public.classes(id) on delete cascade,
  title               text not null,
  deadline            date,
  checkin_every_days  integer not null default 4,
  tasks               jsonb not null default '[]'::jsonb,
  updated_at          timestamptz not null default now(),
  constraint class_projects_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint class_projects_checkin_every check (checkin_every_days between 1 and 14),
  constraint class_projects_tasks_array check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) <= 30)
);

alter table public.class_projects enable row level security;

create policy "class members read the class project"
  on public.class_projects for select to authenticated
  using ( public.is_class_member(class_id) );

revoke all on public.class_projects from anon, authenticated;
grant select on public.class_projects to authenticated;

-- The organizer sets (or replaces) the class project. Teams that already have
-- a project keep theirs.
create or replace function public.set_class_project(
  p_class uuid, p_title text, p_deadline date, p_every integer, p_tasks jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from class_memberships
    where class_id = p_class and user_id = auth.uid() and role = 'organizer'
  ) then
    raise exception 'only the class organizer sets the class project' using errcode = '42501';
  end if;

  insert into class_projects (class_id, title, deadline, checkin_every_days, tasks, updated_at)
  values (p_class, btrim(p_title), p_deadline, coalesce(p_every, 4), coalesce(p_tasks, '[]'::jsonb), now())
  on conflict (class_id) do update
    set title = excluded.title, deadline = excluded.deadline,
        checkin_every_days = excluded.checkin_every_days, tasks = excluded.tasks, updated_at = now();
end;
$$;

-- A pod's first member arrives (create_pod, or a team code / invitation for a
-- pod still without a project): start the class project for it.
create or replace function public.start_class_project()
returns trigger
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
  select c.* into cp
  from pairings p
  join class_projects c on c.class_id = p.class_id
  where p.id = new.pairing_id and p.status = 'active';

  if cp.class_id is null or exists (select 1 from projects where pairing_id = new.pairing_id) then
    return new;
  end if;

  insert into projects (pairing_id, title, deadline, checkin_every_days, created_by)
  values (
    new.pairing_id,
    cp.title,
    case when cp.deadline >= today then cp.deadline end,
    cp.checkin_every_days,
    new.user_id
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
      raise warning 'class project %: skipped task % (%)', cp.class_id, i, sqlstate;
    end;
  end loop;

  return new;
exception when others then
  -- Never block joining a team over the template.
  raise warning 'class project %: not started (%)', cp.class_id, sqlstate;
  return new;
end;
$$;

create trigger pairing_members_start_class_project
  after insert on public.pairing_members
  for each row execute function public.start_class_project();

revoke execute on function public.start_class_project() from public, anon, authenticated;
revoke execute on function public.set_class_project(uuid, text, date, integer, jsonb) from public, anon;
grant execute on function public.set_class_project(uuid, text, date, integer, jsonb) to authenticated;
