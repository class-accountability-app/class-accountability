-- =============================================================================
-- 0022_group_projects.sql — shared projects, tasks, progress and check-ins
-- =============================================================================
-- Plan of record: docs/plans/group-projects-plan.md. Design: docs/mockups/phase4/.
--
-- A pod (pairings row) gets ONE project. The project is split into tasks with
-- an owner and a way of measuring progress (status, a count, or characters).
-- Every few days each member "checks in": a snapshot of their own tasks that
-- the whole pod can read. Between check-ins teammates see a task's title,
-- owner, status and goal, never another member's running numbers or notes.
--
-- This migration is ADDITIVE. Targets, progress_logs, documents and the rest of
-- the old model are untouched (they are re-keyed and dropped by later
-- migrations). Numbering: 0023 re-keys the writing editor's documents to tasks,
-- 0024 drops the old tables.
--
-- WHO SEES WHAT (rule 3: authorization lives here, not in the app)
--   projects, project_tasks   every member of the pod
--   task_progress             the person who logged it, and the task's CURRENT
--                             owner (so a reassigned task keeps its total)
--   project_checkins          every member of the pod; written only by
--                             submit_checkin(), which builds the snapshot in the
--                             database so a client can't forge numbers
--   Organizers are never pod members (SP003), so they see none of it.
--
-- ERROR CODES (next free after SP007)
--   SP008  this member already checked in for the current round
--   SP009  a task's owner must be a member of the project's pod
--
-- Every table has RLS enabled in this file (rule 1).
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  pairing_id          uuid not null unique references public.pairings(id) on delete cascade,
  title               text not null,
  start_date          date not null default ((now() at time zone 'Asia/Tokyo')::date),
  deadline            date,
  checkin_every_days  integer not null default 4,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint projects_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint projects_checkin_every check (checkin_every_days between 1 and 14),
  constraint projects_deadline_after_start check (deadline is null or deadline >= start_date)
);
alter table public.projects enable row level security;

create table public.project_tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  title          text not null,
  owner_id       uuid references public.profiles(id) on delete set null,
  metric         text not null default 'status',
  unit           text,
  target_amount  numeric,
  status         text not null default 'todo',
  input_mode     text not null default 'manual',
  source         text not null default 'manual',   -- where numbers come from; later 'google_docs'
  due            date,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint tasks_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint tasks_metric_check check (metric in ('status', 'count', 'characters')),
  constraint tasks_status_check check (status in ('todo', 'doing', 'done')),
  constraint tasks_input_mode_check check (input_mode in ('manual', 'document')),
  constraint tasks_source_check check (source in ('manual', 'document', 'google_docs')),
  constraint tasks_unit_length check (unit is null or char_length(unit) between 1 and 20),
  constraint tasks_amount_positive check (target_amount is null or target_amount > 0),
  -- A status task has no number; a count has a unit; characters have no unit.
  constraint tasks_status_has_no_amount check (metric <> 'status' or target_amount is null),
  constraint tasks_count_has_unit check (metric <> 'count' or unit is not null),
  constraint tasks_characters_has_no_unit check (metric <> 'characters' or unit is null),
  -- Writing in Study Pods counts characters.
  constraint tasks_document_counts_characters check (input_mode <> 'document' or metric = 'characters')
);
alter table public.project_tasks enable row level security;
create index project_tasks_project_idx on public.project_tasks (project_id, position, created_at);
create index project_tasks_owner_idx on public.project_tasks (owner_id);

create table public.task_progress (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.project_tasks(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  progress_value  numeric not null,
  note            text,
  source          text not null default 'manual',
  client_id       uuid,                        -- makes 記録する safe to repeat (as 0014)
  logged_at       timestamptz not null default now(),
  constraint task_progress_note_length check (note is null or char_length(note) <= 280),
  constraint task_progress_source_check check (source in ('manual', 'document', 'google_docs')),
  -- Only the writing editor logs a negative difference (a shorter document).
  constraint task_progress_value_positive check (progress_value > 0 or source = 'document'),
  constraint task_progress_user_client_id_key unique (user_id, client_id)
);
alter table public.task_progress enable row level security;
create index task_progress_task_idx on public.task_progress (task_id, logged_at desc);
create index task_progress_user_idx on public.task_progress (user_id);

create table public.project_checkins (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  round_start  date not null,
  note         text,
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  constraint project_checkins_note_length check (note is null or char_length(note) <= 280),
  constraint project_checkins_once_per_round unique (project_id, user_id, round_start)
);
alter table public.project_checkins enable row level security;
create index project_checkins_project_idx on public.project_checkins (project_id, round_start desc);


-- =============================================================================
-- 2. HELPERS (security definer, so policies don't recurse: see 0005/0006)
-- =============================================================================

-- Am I a member of the pod this project belongs to?
create or replace function public.is_project_member(target_project uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from projects pr
    join pairing_members pm on pm.pairing_id = pr.pairing_id
    where pr.id = target_project
      and pm.user_id = auth.uid()
  );
$$;

-- Am I the task's current owner?
create or replace function public.is_task_owner(target_task uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from project_tasks t
    where t.id = target_task
      and t.owner_id = auth.uid()
  );
$$;

-- May I log numbers on this task? My task, a counted metric, not written in the
-- editor (the editor logs its own differences).
create or replace function public.can_log_task(target_task uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from project_tasks t
    where t.id = target_task
      and t.owner_id = auth.uid()
      and t.metric <> 'status'
      and t.input_mode = 'manual'
  );
$$;

-- The first day of the check-in round that contains p_today (a pure function,
-- mirrored by lib/checkin.ts; a test checks they agree). Before the start date
-- the round is the start date itself.
create or replace function public.checkin_round_start(p_start date, p_every integer, p_today date)
returns date
language sql
immutable
as $$
  select p_start + (greatest(p_today - p_start, 0) / p_every) * p_every;
$$;


-- =============================================================================
-- 3. POLICIES (all `to authenticated`: a logged-out request evaluates none)
-- =============================================================================

-- projects: the pod reads and edits; anyone in the pod can start it (one per
-- pod: the unique pairing_id); only its creator deletes it.
create policy "read my pod's project"
  on public.projects for select to authenticated
  using ( public.is_pod_member(pairing_id) );

create policy "start my pod's project"
  on public.projects for insert to authenticated
  with check ( created_by = (select auth.uid()) and public.is_pod_member(pairing_id) );

create policy "edit my pod's project"
  on public.projects for update to authenticated
  using ( public.is_pod_member(pairing_id) )
  with check ( public.is_pod_member(pairing_id) );

create policy "delete my own project"
  on public.projects for delete to authenticated
  using ( created_by = (select auth.uid()) and public.is_pod_member(pairing_id) );

-- project_tasks: any member of the pod reads and edits the task list.
create policy "read my pod's tasks"
  on public.project_tasks for select to authenticated
  using ( public.is_project_member(project_id) );

create policy "add tasks to my pod's project"
  on public.project_tasks for insert to authenticated
  with check ( public.is_project_member(project_id) );

create policy "edit my pod's tasks"
  on public.project_tasks for update to authenticated
  using ( public.is_project_member(project_id) )
  with check ( public.is_project_member(project_id) );

create policy "delete my pod's tasks"
  on public.project_tasks for delete to authenticated
  using ( public.is_project_member(project_id) );

-- task_progress: the logger and the task's current owner read; only the owner
-- of a task logs on it, and only as themselves, only 'manual' rows (the editor
-- and integrations write through definer functions). Amount and note can be
-- edited and the row deleted by whoever logged it.
create policy "read my progress and my tasks' progress"
  on public.task_progress for select to authenticated
  using ( user_id = (select auth.uid()) or public.is_task_owner(task_id) );

create policy "log progress on my task"
  on public.task_progress for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and source = 'manual'
    and public.can_log_task(task_id)
  );

create policy "edit my own manual progress"
  on public.task_progress for update to authenticated
  using ( user_id = (select auth.uid()) and source = 'manual' )
  with check ( user_id = (select auth.uid()) and source = 'manual' );

create policy "delete my own manual progress"
  on public.task_progress for delete to authenticated
  using ( user_id = (select auth.uid()) and source = 'manual' );

-- project_checkins: the pod reads. No INSERT/UPDATE/DELETE policy and no grant:
-- rows come only from submit_checkin().
create policy "read my pod's check-ins"
  on public.project_checkins for select to authenticated
  using ( public.is_project_member(project_id) );


-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- A project's pod and start date never change (the check-in rounds hang off the
-- start date). created_by may only go to null (its creator deleted their account).
create or replace function public.keep_project_identity()
returns trigger
language plpgsql
as $$
begin
  if new.pairing_id is distinct from old.pairing_id
     or new.start_date is distinct from old.start_date
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'a project''s pod, start date and creator cannot change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_keep_identity
  before update on public.projects
  for each row execute function public.keep_project_identity();

-- A task stays in its project, and its owner must be in the project's pod.
create or replace function public.check_task_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'a task cannot move to another project' using errcode = '42501';
  end if;
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    if not exists (
      select 1
      from projects pr
      join pairing_members pm on pm.pairing_id = pr.pairing_id
      where pr.id = new.project_id and pm.user_id = new.owner_id
    ) then
      raise exception 'a task''s owner must be in the project''s pod' using errcode = 'SP009';
    end if;
  end if;
  return new;
end;
$$;

create trigger project_tasks_check_owner
  before insert or update on public.project_tasks
  for each row execute function public.check_task_owner();

-- Someone who leaves the pod (or whose account goes) is no longer an owner.
-- Their past progress stays with the task.
create or replace function public.unassign_tasks_of_leaver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update project_tasks t
     set owner_id = null
   where t.owner_id = old.user_id
     and t.project_id in (select pr.id from projects pr where pr.pairing_id = old.pairing_id);
  return old;
end;
$$;

create trigger pairing_members_unassign_tasks
  after delete on public.pairing_members
  for each row execute function public.unassign_tasks_of_leaver();

-- A progress entry keeps its task, owner, time, client id and source; only the
-- amount and note change (as 0014).
create or replace function public.keep_task_progress_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.task_id is distinct from old.task_id
     or new.user_id is distinct from old.user_id
     or new.logged_at is distinct from old.logged_at
     or new.client_id is distinct from old.client_id
     or new.source is distinct from old.source then
    raise exception 'only the amount and note of an entry can change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger task_progress_keep_identity
  before update on public.task_progress
  for each row execute function public.keep_task_progress_identity();

-- A student's insert gets the server's clock (as 0014). Fixtures inserted by the
-- table owner keep the time they are given.
create or replace function public.set_task_progress_time()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.logged_at := now();
  end if;
  return new;
end;
$$;

create trigger task_progress_server_time
  before insert on public.task_progress
  for each row execute function public.set_task_progress_time();


-- =============================================================================
-- 5. submit_checkin(): the only way a check-in row is written
-- =============================================================================
-- Builds the caller's snapshot (their own tasks: title, metric, unit, goal,
-- total so far, status) from the database, keyed to the current round in Tokyo
-- days. A second check-in in the same round raises SP008.
create or replace function public.submit_checkin(p_project uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  proj      public.projects;
  today     date := (now() at time zone 'Asia/Tokyo')::date;
  round_day date;
  snap      jsonb;
  clean     text := nullif(btrim(p_note), '');
  new_id    uuid;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into proj from projects where id = p_project;
  if not found or not exists (
    select 1 from pairing_members pm where pm.pairing_id = proj.pairing_id and pm.user_id = me
  ) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  if clean is not null and char_length(clean) > 280 then
    raise exception 'note too long' using errcode = '23514';
  end if;

  round_day := public.checkin_round_start(proj.start_date, proj.checkin_every_days, today);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'task_id', t.id,
             'title', t.title,
             'metric', t.metric,
             'unit', t.unit,
             'target_amount', t.target_amount,
             'total', case when t.metric = 'status' then null
                           else (select coalesce(sum(tp.progress_value), 0)
                                 from task_progress tp where tp.task_id = t.id) end,
             'status', t.status
           ) order by t.position, t.created_at), '[]'::jsonb)
    into snap
    from project_tasks t
   where t.project_id = p_project and t.owner_id = me;

  begin
    insert into project_checkins (project_id, user_id, round_start, note, snapshot)
    values (p_project, me, round_day, clean, snap)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'already checked in this round' using errcode = 'SP008';
  end;

  return new_id;
end;
$$;


-- =============================================================================
-- 6. GRANTS
-- =============================================================================
-- Logged-out requests get nothing. Signed-in users keep the table privileges
-- RLS governs, minus the ones RLS doesn't cover (TRUNCATE, REFERENCES, TRIGGER).
revoke all on public.projects, public.project_tasks, public.task_progress,
              public.project_checkins from public, anon;
revoke truncate, references, trigger on public.projects, public.project_tasks,
              public.task_progress, public.project_checkins from authenticated;

-- Check-ins: read only. submit_checkin() writes them as the table owner.
revoke insert, update, delete on public.project_checkins from authenticated;

revoke execute on function public.is_project_member(uuid) from public, anon;
revoke execute on function public.is_task_owner(uuid) from public, anon;
revoke execute on function public.can_log_task(uuid) from public, anon;
revoke execute on function public.checkin_round_start(date, integer, date) from public, anon;
revoke execute on function public.submit_checkin(uuid, text) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_task_owner(uuid) to authenticated;
grant execute on function public.can_log_task(uuid) to authenticated;
grant execute on function public.checkin_round_start(date, integer, date) to authenticated;
grant execute on function public.submit_checkin(uuid, text) to authenticated;

revoke execute on function public.keep_project_identity() from public, anon, authenticated;
revoke execute on function public.check_task_owner() from public, anon, authenticated;
revoke execute on function public.unassign_tasks_of_leaver() from public, anon, authenticated;
revoke execute on function public.keep_task_progress_identity() from public, anon, authenticated;
revoke execute on function public.set_task_progress_time() from public, anon, authenticated;


-- =============================================================================
-- VERIFY: supabase/tests/rls_group_projects.sql (run it as in CLAUDE.md "RLS
-- tests"; expect a final row reading 'all RLS tests passed').
-- =============================================================================
