-- =============================================================================
-- 0053_team_size_limit.sql — the teacher sets the team size limit per class
-- (the author's ask of 2026-11-27)
-- =============================================================================
--
-- Until now every team had a cap of 6, written into join_pod_by_code (0028)
-- and the organizer's team tools (0036). Now each class has its own limit:
--
-- - classes.team_size_limit: 2–10, default 6, so every existing class keeps 6.
-- - Only the class's organizer changes it, through set_team_size_limit()
--   (there is still no UPDATE policy on classes; 0012's trigger keeps
--   join_code as it was).
-- - join_pod_by_code, private.place_student, organizer_create_team and
--   organizer_auto_split read the class's limit instead of 6 (SP014 when
--   full, as before). Auto-split takes a size from 2 to the limit (SP017).
-- - pod_by_join_code also returns team_limit, so the join page can say when
--   a team is full. Its return type changes, so it is dropped and re-created
--   with the same grants.
-- - Lowering the limit never removes anyone: a team already over it keeps its
--   members and simply takes no one new until it is under the limit.
--
-- Invitations and requests (accept_pod_invitation, 0004) keep their soft cap
-- in the server action, which now reads the same column.
--
-- Test: supabase/tests/rls_team_size_limit.sql.
-- =============================================================================

alter table public.classes
  add column team_size_limit smallint not null default 6
  constraint classes_team_size_limit check (team_size_limit between 2 and 10);

-- The limit of a class (6 if the class is gone, which callers never reach).
create or replace function private.team_size_limit(p_class uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce((select c.team_size_limit::integer from public.classes c where c.id = p_class), 6);
$$;

revoke execute on function private.team_size_limit(uuid) from public, anon, authenticated;

-- 1. SETTING IT ---------------------------------------------------------------------

create or replace function public.set_team_size_limit(p_class uuid, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_class_organizer(p_class) then
    raise exception 'only the class organizer can change the team size' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 2 or p_limit > 10 then
    raise exception 'team size limit must be 2 to 10' using errcode = 'SP017';
  end if;
  update classes set team_size_limit = p_limit where id = p_class;
end;
$$;

revoke execute on function public.set_team_size_limit(uuid, integer) from public, anon;
grant execute on function public.set_team_size_limit(uuid, integer) to authenticated;

-- 2. THE JOIN PAGE ------------------------------------------------------------------

drop function public.pod_by_join_code(text);

create function public.pod_by_join_code(code text)
returns table (pod_id uuid, class_id uuid, class_name text, member_count integer, is_member boolean, in_class boolean, team_limit integer)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, c.id, c.name,
         (select count(*)::integer from pairing_members pm where pm.pairing_id = p.id),
         exists (select 1 from pairing_members pm where pm.pairing_id = p.id and pm.user_id = auth.uid()),
         exists (select 1 from class_memberships cm where cm.class_id = c.id and cm.user_id = auth.uid()),
         c.team_size_limit::integer
  from pod_join_codes j
  join pairings p on p.id = j.pod_id and p.status = 'active'
  join classes c on c.id = p.class_id
  -- Qualified: in a SQL function a bare `code` would mean the column.
  where auth.uid() is not null
    and j.code = upper(regexp_replace(pod_by_join_code.code, '[\s-]', '', 'g'));
$$;

revoke execute on function public.pod_by_join_code(text) from public, anon;
grant execute on function public.pod_by_join_code(text) to authenticated;

-- 3. JOINING BY CODE (0028, the cap now from the class) ------------------------------

create or replace function public.join_pod_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pod uuid;
  target_class uuid;
  my_role text;
  members integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select p.id, p.class_id into target_pod, target_class
  from pod_join_codes j
  join pairings p on p.id = j.pod_id and p.status = 'active'
  where j.code = upper(regexp_replace(join_pod_by_code.code, '[\s-]', '', 'g'));

  if target_pod is null then
    raise exception 'no team with this code' using errcode = 'SP015';
  end if;

  -- Already in it: nothing to do.
  if exists (select 1 from pairing_members where pairing_id = target_pod and user_id = auth.uid()) then
    return target_pod;
  end if;

  select role into my_role from class_memberships where class_id = target_class and user_id = auth.uid();
  if my_role = 'organizer' then
    raise exception 'organizers are not in pods' using errcode = 'SP003';
  end if;

  -- Two people joining the last seat at once: lock the pod row first.
  perform 1 from pairings where id = target_pod for update;
  select count(*) into members from pairing_members where pairing_id = target_pod;
  if members >= private.team_size_limit(target_class) then
    raise exception 'this team is full' using errcode = 'SP014';
  end if;

  if my_role is null then
    insert into class_memberships (user_id, class_id, role)
    values (auth.uid(), target_class, 'student')
    on conflict (user_id, class_id) do nothing;
  end if;

  -- 0012's trigger refuses a second pod in this class (SP002); 0015's, a
  -- non-student (SP003).
  insert into pairing_members (pairing_id, user_id) values (target_pod, auth.uid());

  -- Invitations and requests about me in this class are settled now.
  delete from pod_invitations
  where class_id = target_class and invitee_id = auth.uid() and status = 'pending';

  return target_pod;
end;
$$;

-- 4. THE ORGANIZER'S TEAM TOOLS (0036, the cap now from the class) -------------------

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
    if members >= private.team_size_limit(p_class) then
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
  if cardinality(p_members) > private.team_size_limit(p_class) then
    raise exception 'this team is full' using errcode = 'SP014';
  end if;

  insert into pairings (class_id, name) values (p_class, nullif(btrim(p_name), '')) returning id into new_pod;
  foreach m in array p_members loop
    perform private.place_student(p_class, m, new_pod);
  end loop;
  return new_pod;
end;
$$;

-- Everyone without a team goes into new teams of about p_size (2 to the
-- class's limit), in a random order; sizes differ by at most one. Returns how
-- many teams it made.
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
  if p_size is null or p_size < 2 or p_size > private.team_size_limit(p_class) then
    raise exception 'team size must be 2 to the class limit' using errcode = 'SP017';
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
