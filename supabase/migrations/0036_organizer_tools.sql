-- =============================================================================
-- 0036_organizer_tools.sql — the organizer runs the class's teams
-- (author's checklist of 2026-10-30, item G; decided with the author:
-- "see who has no team, make and fill teams, move or remove students, team
-- names and messages")
-- =============================================================================
--
-- This widens 0015 on purpose, for the class's organizer only:
--   * class_roster(class): every student's display name and team (no emails,
--     no numbers, no text). Before this the organizer saw only a count.
--   * organizer_create_team / organizer_move_student / organizer_auto_split:
--     make teams, move a student, take a student out of a team, split the
--     students without a team into teams of a chosen size. The existing
--     triggers still hold for every insert: students only (SP003), one team
--     per class (SP002); these functions add the cap of 6 (SP014).
--   * rename_team(pod, name): the organizer or any member of the team.
--   * class_announcements: the organizer posts short messages that every
--     member of the class reads (post_class_announcement /
--     delete_class_announcement).
-- The organizer still never sees tasks, numbers, check-ins, memos or text.
-- The privacy policy says so (2026-10-31).
--
-- RLS on for the new table (rule 1). Test: supabase/tests/rls_organizer_tools.sql.
-- =============================================================================


-- 1. TEAM NAMES ------------------------------------------------------------------

alter table public.pairings
  add column name text,
  add constraint pairings_name_check check (
    name is null or (char_length(btrim(name)) between 1 and 30 and name !~ '[[:cntrl:]]')
  );

create or replace function public.is_class_organizer(p_class uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from class_memberships
    where class_id = p_class and user_id = auth.uid() and role = 'organizer'
  );
$$;

create or replace function public.rename_team(p_pod uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pod_class uuid;
begin
  select class_id into pod_class from pairings where id = p_pod and status = 'active';
  if pod_class is null
     or not (public.is_pod_member(p_pod) or public.is_class_organizer(pod_class)) then
    raise exception 'not allowed to rename this team' using errcode = '42501';
  end if;
  update pairings set name = nullif(btrim(p_name), '') where id = p_pod;
end;
$$;


-- 2. THE ROSTER (organizer only) -------------------------------------------------

create or replace function public.class_roster(p_class uuid)
returns table (user_id uuid, display_name text, pod_id uuid, team_no integer, team_name text, joined_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  with teams as (
    select p.id, p.name, row_number() over (order by p.created_at, p.id)::integer as team_no
    from pairings p
    where p.class_id = p_class and p.status = 'active'
  )
  select cm.user_id, pr.display_name, t.id, t.team_no, t.name, cm.joined_at
  from class_memberships cm
  join profiles pr on pr.id = cm.user_id
  left join pairing_members pm on pm.user_id = cm.user_id and pm.pairing_id in (select id from teams)
  left join teams t on t.id = pm.pairing_id
  where cm.class_id = p_class
    and cm.role = 'student'
    and public.is_class_organizer(p_class)
  order by t.team_no nulls first, pr.display_name;
$$;

-- Teams with nobody in them don't exist (0016 removes an empty pod), so the
-- organizer's list of teams is the roster grouped by pod.


-- 3. MOVING STUDENTS ---------------------------------------------------------------

-- Takes p_user out of their team in p_class (if any) and puts them in p_to
-- (null = no team). No permission check: the public functions below check.
create or replace function private.place_student(p_class uuid, p_user uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_pod uuid;
  members integer;
begin
  if not exists (select 1 from class_memberships where class_id = p_class and user_id = p_user and role = 'student') then
    raise exception 'not a student of this class' using errcode = 'SP003';
  end if;

  select pm.pairing_id into current_pod
  from pairing_members pm join pairings p on p.id = pm.pairing_id
  where pm.user_id = p_user and p.class_id = p_class and p.status = 'active';

  if current_pod is not distinct from p_to then
    return;
  end if;

  if p_to is not null then
    if not exists (select 1 from pairings where id = p_to and class_id = p_class and status = 'active') then
      raise exception 'that team is not in this class' using errcode = '42501';
    end if;
    perform 1 from pairings where id = p_to for update;
    select count(*) into members from pairing_members where pairing_id = p_to;
    if members >= 6 then
      raise exception 'this team is full' using errcode = 'SP014';
    end if;
  end if;

  if current_pod is not null then
    perform 1 from pairings where id = current_pod for update;
    delete from pairing_members where pairing_id = current_pod and user_id = p_user;
    delete from pod_invitations
    where pod_id = current_pod and kind = 'invite' and inviter_id = p_user and status = 'pending';
    if not exists (select 1 from pairing_members where pairing_id = current_pod) then
      delete from pairings where id = current_pod;
    end if;
  end if;

  if p_to is not null then
    insert into pairing_members (pairing_id, user_id) values (p_to, p_user);
    delete from pod_invitations where class_id = p_class and invitee_id = p_user and status = 'pending';
  end if;
end;
$$;

revoke execute on function private.place_student(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.organizer_move_student(p_class uuid, p_user uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer can move students' using errcode = '42501';
  end if;
  perform private.place_student(p_class, p_user, p_to);
end;
$$;

create or replace function public.organizer_create_team(p_class uuid, p_name text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pod uuid;
  m uuid;
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer can make teams' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_members), 0) < 1 then
    raise exception 'a team needs at least one student' using errcode = 'SP017';
  end if;
  if cardinality(p_members) > 6 then
    raise exception 'this team is full' using errcode = 'SP014';
  end if;

  insert into pairings (class_id, name) values (p_class, nullif(btrim(p_name), '')) returning id into new_pod;
  foreach m in array p_members loop
    perform private.place_student(p_class, m, new_pod);
  end loop;
  return new_pod;
end;
$$;

-- Everyone without a team goes into new teams of about p_size (2–6), in a
-- random order; sizes differ by at most one. Returns how many teams it made.
create or replace function public.organizer_auto_split(p_class uuid, p_size integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  waiting uuid[];
  n integer;
  k integer;
  pods uuid[] := '{}';
  i integer;
  new_pod uuid;
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer can make teams' using errcode = '42501';
  end if;
  if p_size is null or p_size < 2 or p_size > 6 then
    raise exception 'team size must be 2 to 6' using errcode = 'SP017';
  end if;

  select coalesce(array_agg(cm.user_id order by random()), '{}') into waiting
  from class_memberships cm
  where cm.class_id = p_class and cm.role = 'student'
    and not exists (
      select 1 from pairing_members pm join pairings p on p.id = pm.pairing_id
      where pm.user_id = cm.user_id and p.class_id = p_class and p.status = 'active'
    );

  n := cardinality(waiting);
  if n = 0 then
    return 0;
  end if;
  k := ceil(n::numeric / p_size)::integer;

  for i in 1..k loop
    insert into pairings (class_id) values (p_class) returning id into new_pod;
    pods := pods || new_pod;
  end loop;
  -- Round robin: student i goes to team (i mod k).
  for i in 1..n loop
    perform private.place_student(p_class, waiting[i], pods[((i - 1) % k) + 1]);
  end loop;
  return k;
end;
$$;


-- 4. ANNOUNCEMENTS -------------------------------------------------------------------

create table public.class_announcements (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint class_announcements_body check (char_length(btrim(body)) between 1 and 500)
);
alter table public.class_announcements enable row level security;
create index class_announcements_class_idx on public.class_announcements (class_id, created_at desc);

create policy "class members read announcements"
  on public.class_announcements for select to authenticated
  using ( public.is_class_member(class_id) );

revoke all on public.class_announcements from public, anon, authenticated;
grant select on public.class_announcements to authenticated;

create or replace function public.post_class_announcement(p_class uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer can post' using errcode = '42501';
  end if;
  insert into class_announcements (class_id, created_by, body)
  values (p_class, auth.uid(), btrim(p_body))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.delete_class_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from class_announcements a
  where a.id = p_id and public.is_class_organizer(a.class_id);
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;


-- 5. GRANTS -------------------------------------------------------------------------

revoke execute on function public.is_class_organizer(uuid) from public, anon;
revoke execute on function public.rename_team(uuid, text) from public, anon;
revoke execute on function public.class_roster(uuid) from public, anon;
revoke execute on function public.organizer_move_student(uuid, uuid, uuid) from public, anon;
revoke execute on function public.organizer_create_team(uuid, text, uuid[]) from public, anon;
revoke execute on function public.organizer_auto_split(uuid, integer) from public, anon;
revoke execute on function public.post_class_announcement(uuid, text) from public, anon;
revoke execute on function public.delete_class_announcement(uuid) from public, anon;
grant execute on function public.is_class_organizer(uuid) to authenticated;
grant execute on function public.rename_team(uuid, text) to authenticated;
grant execute on function public.class_roster(uuid) to authenticated;
grant execute on function public.organizer_move_student(uuid, uuid, uuid) to authenticated;
grant execute on function public.organizer_create_team(uuid, text, uuid[]) to authenticated;
grant execute on function public.organizer_auto_split(uuid, integer) to authenticated;
grant execute on function public.post_class_announcement(uuid, text) to authenticated;
grant execute on function public.delete_class_announcement(uuid) to authenticated;
