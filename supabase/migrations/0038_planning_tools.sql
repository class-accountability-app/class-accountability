-- =============================================================================
-- 0038_planning_tools.sql — feature batch 2 (the author asked for all of the
-- suggested features on 2026-10-31). Needs 0036 and 0037.
-- =============================================================================
--
-- 1. Auto-done: when Google counting (source 'google_docs') brings a counted
--    task with a goal to its goal, the task becomes 'done'.
-- 2. task_dependencies: "this task waits on that one", within one project.
--    The team reads and writes them; no loops (of any length), no self-links.
-- 3. meeting_notes: one shared note per meeting (decisions, next steps), up to
--    2,000 characters. The team reads and writes it.
-- 4. Weekly digest push (kind 'weekly_digest'): Monday 09:15 JST to members of
--    active projects. The words name nothing ("新しい週です…").
-- 5. class_milestones: the organizer's checkpoints (title, due day, target %).
--    Class members read them; class_milestone_status(class) gives only the
--    organizer how many teams have reached each one (no names, no team ids).
-- 6. Team-inactive alert (kind 'team_inactive'): daily 09:20 JST, one push to
--    the class's organizer when a team with an active project has had no
--    activity for 7 days. Says only how many teams, opens the class page.
--
-- Deploy the send-nudge-push function that knows the two new kinds (and the
-- wider PUSH_PATH) BEFORE this migration. Every table has RLS (rule 1).
-- Test: supabase/tests/rls_planning_tools.sql.
-- =============================================================================


-- 1. AUTO-DONE FROM GOOGLE ---------------------------------------------------------

create or replace function private.auto_done_from_google()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.project_tasks;
  total numeric;
begin
  if new.source <> 'google_docs' then
    return new;
  end if;
  select * into task from public.project_tasks where id = new.task_id;
  if task.id is null or task.status = 'done' or task.metric = 'status' or task.target_amount is null then
    return new;
  end if;
  select coalesce(sum(progress_value), 0) into total from public.task_progress where task_id = new.task_id;
  if total >= task.target_amount then
    update public.project_tasks set status = 'done' where id = task.id;
  end if;
  return new;
exception when others then
  raise warning 'auto-done skipped (%)', sqlstate;
  return new;
end;
$$;

revoke execute on function private.auto_done_from_google() from public, anon, authenticated;

create trigger task_progress_auto_done
  after insert on public.task_progress
  for each row execute function private.auto_done_from_google();


-- 2. TASK DEPENDENCIES ----------------------------------------------------------------

create table public.task_dependencies (
  task_id     uuid not null references public.project_tasks(id) on delete cascade,
  depends_on  uuid not null references public.project_tasks(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (task_id, depends_on),
  constraint task_dependencies_not_self check (task_id <> depends_on)
);
alter table public.task_dependencies enable row level security;
create index task_dependencies_depends_idx on public.task_dependencies (depends_on);

-- Both tasks in the same project, and no two-task loop.
create or replace function public.check_task_dependency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select project_id from project_tasks where id = new.task_id)
     is distinct from (select project_id from project_tasks where id = new.depends_on) then
    raise exception 'tasks are in different projects' using errcode = 'SP018';
  end if;
  -- Any loop: following "waits for" from depends_on must never reach task_id.
  if exists (
    with recursive chain(id) as (
      select new.depends_on
      union
      select d.depends_on from task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'that would be a loop' using errcode = 'SP018';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_task_dependency() from public, anon, authenticated;

create trigger task_dependencies_check
  before insert on public.task_dependencies
  for each row execute function public.check_task_dependency();

create policy "team reads task dependencies"
  on public.task_dependencies for select to authenticated
  using ( public.is_project_member((select project_id from public.project_tasks where id = task_id)) );
create policy "team adds task dependencies"
  on public.task_dependencies for insert to authenticated
  with check ( public.is_project_member((select project_id from public.project_tasks where id = task_id)) );
create policy "team removes task dependencies"
  on public.task_dependencies for delete to authenticated
  using ( public.is_project_member((select project_id from public.project_tasks where id = task_id)) );

revoke all on public.task_dependencies from public, anon, authenticated;
grant select, insert, delete on public.task_dependencies to authenticated;


-- 3. MEETING NOTES -------------------------------------------------------------------

create table public.meeting_notes (
  poll_id     uuid primary key references public.meeting_polls(id) on delete cascade,
  body        text not null default '',
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint meeting_notes_length check (char_length(body) <= 2000)
);
alter table public.meeting_notes enable row level security;

create policy "team reads meeting notes"
  on public.meeting_notes for select to authenticated
  using ( public.is_poll_member(poll_id) );
create policy "team writes meeting notes"
  on public.meeting_notes for insert to authenticated
  with check ( public.is_poll_member(poll_id) and updated_by = auth.uid() );
create policy "team edits meeting notes"
  on public.meeting_notes for update to authenticated
  using ( public.is_poll_member(poll_id) )
  with check ( public.is_poll_member(poll_id) and updated_by = auth.uid() );

-- The server's clock, never the browser's.
create or replace function public.stamp_meeting_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.stamp_meeting_note() from public, anon, authenticated;
create trigger meeting_notes_stamp
  before insert or update on public.meeting_notes
  for each row execute function public.stamp_meeting_note();

revoke all on public.meeting_notes from public, anon, authenticated;
grant select, insert, update (body, updated_by, updated_at) on public.meeting_notes to authenticated;


-- 4–6 share push_events -------------------------------------------------------------

alter table public.push_events
  add column class_id uuid references public.classes(id) on delete cascade;

alter table public.push_events drop constraint push_events_kind_check;
alter table public.push_events add constraint push_events_kind_check
  check (kind in ('meeting_reminder', 'task_stalled', 'checkin_due', 'poll_vote_due', 'announcement',
                  'weekly_digest', 'team_inactive'));

alter table public.push_events drop constraint push_events_ref_check;
alter table public.push_events add constraint push_events_ref_check check (
  (kind in ('meeting_reminder', 'poll_vote_due') and poll_id is not null and task_id is null and project_id is null and announcement_id is null and class_id is null)
  or (kind = 'task_stalled' and task_id is not null and poll_id is null and project_id is null and announcement_id is null and class_id is null)
  or (kind in ('checkin_due', 'weekly_digest') and project_id is not null and poll_id is null and task_id is null and announcement_id is null and class_id is null)
  or (kind = 'announcement' and announcement_id is not null and poll_id is null and task_id is null and project_id is null and class_id is null)
  or (kind = 'team_inactive' and class_id is not null and poll_id is null and task_id is null and project_id is null and announcement_id is null)
);

-- 4. Weekly digest: one per member per active project per Tokyo week.
create or replace function private.queue_weekly_digests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  week text := to_char((now() at time zone 'Asia/Tokyo')::date, 'IYYY-IW');
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, project_id)
  select pm.user_id, 'weekly_digest', pr.id::text || '@' || week, pr.id
  from public.projects pr
  join public.pairing_members pm on pm.pairing_id = pr.pairing_id
  where pr.status = 'active'
    and (pr.deadline is null or pr.deadline >= (now() at time zone 'Asia/Tokyo')::date)
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.queue_weekly_digests() from public, anon, authenticated;

-- 6. Team-inactive alert: one push per organizer per class per Tokyo day,
-- when at least one team with an active project has been quiet for 7 days
-- (no progress logged, no check-in, project older than 7 days).
create or replace function private.queue_team_inactive_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today text := ((now() at time zone 'Asia/Tokyo')::date)::text;
  n integer;
begin
  insert into public.push_events (user_id, kind, ref_key, class_id)
  select cm.user_id, 'team_inactive', p.class_id::text || '@' || today, p.class_id
  from public.pairings p
  join public.projects pr on pr.pairing_id = p.id and pr.status = 'active'
  join public.class_memberships cm on cm.class_id = p.class_id and cm.role = 'organizer'
  where p.status = 'active'
    and pr.created_at < now() - interval '7 days'
    and not exists (
      select 1 from public.task_progress tp
      join public.project_tasks t on t.id = tp.task_id
      where t.project_id = pr.id and tp.logged_at > now() - interval '7 days'
    )
    and not exists (
      select 1 from public.project_checkins c
      where c.project_id = pr.id and c.created_at > now() - interval '7 days'
    )
  group by cm.user_id, p.class_id
  on conflict (user_id, kind, ref_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.queue_team_inactive_alerts() from public, anon, authenticated;

-- Monday 00:15 UTC = 09:15 JST; daily 00:20 UTC = 09:20 JST.
select cron.schedule('queue-weekly-digests', '15 0 * * 1',
  $$select private.queue_weekly_digests(); select private.send_push_events();$$);
select cron.schedule('queue-team-inactive-alerts', '20 0 * * *',
  $$select private.queue_team_inactive_alerts(); select private.send_push_events();$$);


-- 5. CLASS MILESTONES -----------------------------------------------------------------

create table public.class_milestones (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  title           text not null,
  due             date not null,
  target_percent  integer not null,
  created_at      timestamptz not null default now(),
  constraint class_milestones_title check (char_length(btrim(title)) between 1 and 60 and title !~ '[[:cntrl:]]'),
  constraint class_milestones_percent check (target_percent between 1 and 100)
);
alter table public.class_milestones enable row level security;
create index class_milestones_class_idx on public.class_milestones (class_id, due);

create policy "class members read milestones"
  on public.class_milestones for select to authenticated
  using ( public.is_class_member(class_id) );

revoke all on public.class_milestones from public, anon, authenticated;
grant select on public.class_milestones to authenticated;

create or replace function public.add_class_milestone(p_class uuid, p_title text, p_due date, p_percent integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer adds milestones' using errcode = '42501';
  end if;
  if (select count(*) from class_milestones where class_id = p_class) >= 20 then
    raise exception 'at most 20 milestones' using errcode = 'SP018';
  end if;
  insert into class_milestones (class_id, title, due, target_percent)
  values (p_class, btrim(p_title), p_due, p_percent)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.delete_class_milestone(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from class_milestones m where m.id = p_id and public.is_class_organizer(m.class_id);
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

-- Per milestone: teams with an active project, and how many are at or above
-- the target %. Same % rule as class_team_summary (0027/0033). Organizer only.
create or replace function public.class_milestone_status(p_class uuid)
returns table (milestone_id uuid, title text, due date, target_percent integer, teams integer, reached integer)
language sql
security definer
set search_path = public
stable
as $$
  with pct as (
    select s.percent from public.class_team_summary(p_class) s where s.has_project
  )
  select m.id, m.title, m.due, m.target_percent,
         (select count(*)::integer from pct),
         (select count(*)::integer from pct where pct.percent >= m.target_percent)
  from class_milestones m
  where m.class_id = p_class and public.is_class_organizer(p_class)
  order by m.due, m.title;
$$;

revoke execute on function public.add_class_milestone(uuid, text, date, integer) from public, anon;
revoke execute on function public.delete_class_milestone(uuid) from public, anon;
revoke execute on function public.class_milestone_status(uuid) from public, anon;
grant execute on function public.add_class_milestone(uuid, text, date, integer) to authenticated;
grant execute on function public.delete_class_milestone(uuid) to authenticated;
grant execute on function public.class_milestone_status(uuid) to authenticated;


-- Finished projects stay read-only (0033) for the new team tables too.
create or replace function public.guard_finished_planning()
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
  if tg_table_name = 'task_dependencies' then
    select project_id into proj from project_tasks where id = new.task_id;
  else
    select project_id into proj from meeting_polls where id = new.poll_id;
  end if;
  if exists (select 1 from projects where id = proj and status = 'done') then
    raise exception 'this project is finished' using errcode = 'SP016';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_finished_planning() from public, anon, authenticated;

create trigger task_dependencies_guard_finished
  before insert on public.task_dependencies
  for each row execute function public.guard_finished_planning();
create trigger meeting_notes_guard_finished
  before insert or update on public.meeting_notes
  for each row execute function public.guard_finished_planning();
