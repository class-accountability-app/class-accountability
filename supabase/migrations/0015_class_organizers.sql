-- =============================================================================
-- 0015_class_organizers.sql — only approved accounts create classes; whoever
-- creates a class is its organizer (shares the link and QR, uses 授業で映す,
-- never sees anyone's progress or name); plus a security tidy-up
-- =============================================================================
--
-- 1. WHO MAY CREATE CLASSES. profiles.can_create_classes (default false).
--    Students can't set it: their only column grant on profiles is UPDATE
--    (display_name) (0011). It is changed only by SQL as the project owner.
--
-- 2. ORGANIZER ROLE. class_memberships.role is 'student' or 'organizer'.
--    add_creator_membership makes the creator the organizer; join_class_by_code
--    always joins as a student and never changes an existing role. There is
--    still no INSERT or UPDATE policy on class_memberships (0013), so nobody
--    sets or changes role except these two definer functions.
--    Organizers are members (they see the class and its join link), but not
--    classmates: they aren't counted, can't be in, create, join or be invited
--    to pods, can't create targets, and see no student's membership row or
--    profile. Existing memberships stay 'student' (the column default).
--
-- 3. TIDY-UP. Every policy that applied to all roles now applies to signed-in
--    users only, so a logged-out (anon) request never evaluates a policy or
--    calls a helper: it gets RLS's default, no rows and no writes. Then EXECUTE
--    is revoked from anon (and public) on the helpers and signed-in actions,
--    and from everyone on trigger functions. The unused is_podmate() is dropped.
--
-- Tests: supabase/tests/rls_class_organizers.sql (and the four older files).
-- =============================================================================


-- =============================================================================
-- 1. WHO MAY CREATE CLASSES
-- =============================================================================

alter table public.profiles
  add column can_create_classes boolean not null default false;

drop policy "authenticated users can create classes" on public.classes;
create policy "approved accounts create classes" on public.classes
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.can_create_classes
    )
  );


-- =============================================================================
-- 2. ORGANIZER ROLE
-- =============================================================================

alter table public.class_memberships
  add column role text not null default 'student'
  constraint class_memberships_role_check check (role in ('student', 'organizer'));

-- A member who studies in the class (organizers are members, not classmates).
create or replace function public.is_class_student(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from class_memberships cm
    where cm.class_id = target_class
      and cm.user_id = auth.uid()
      and cm.role = 'student'
  );
$$;

-- The creator becomes the organizer. Only for a signed-in creator's own
-- insert (auth.uid() = created_by), so owner inserts add nobody (0013).
create or replace function public.add_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null and new.created_by = auth.uid() then
    insert into class_memberships (user_id, class_id, role)
    values (new.created_by, new.id, 'organizer')
    on conflict (user_id, class_id) do nothing;
  end if;
  return new;
end;
$$;

-- Joining by code is always as a student, and never changes an existing role.
create or replace function public.join_class_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select c.id into target_class
  from classes c
  where c.join_code = upper(regexp_replace(code, '[\s-]', '', 'g'));

  if target_class is null then
    return null;
  end if;

  insert into class_memberships (user_id, class_id, role)
  values (auth.uid(), target_class, 'student')
  on conflict (user_id, class_id) do nothing;

  return target_class;
end;
$$;

-- Screen 04 and the organizer's class page: the member count is students
-- only. "Am I in it" counts either role.
create or replace function public.class_by_join_code(code text)
returns table(id uuid, name text, university text, term text, member_count bigint, is_member boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.university, c.term,
         (select count(*) from class_memberships cm
          where cm.class_id = c.id and cm.role = 'student'),
         exists (
           select 1 from class_memberships cm
           where cm.class_id = c.id and cm.user_id = auth.uid()
         )
  from classes c
  where c.join_code = upper(regexp_replace(code, '[\s-]', '', 'g'));
$$;

-- Membership rows: your own, plus the student rows of classes you study in.
-- An organizer sees only their own row; students don't see the organizer's.
drop policy "read memberships of my classes" on public.class_memberships;
create policy "read own and classmates memberships" on public.class_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or (role = 'student' and public.is_class_student(class_id))
  );

-- Names: students see their student classmates only. An organizer sees no
-- student's profile, and students don't see the organizer's.
drop policy "read classmates profiles" on public.profiles;
create policy "read classmates profiles" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from class_memberships mine
      join class_memberships theirs on theirs.class_id = mine.class_id
      where mine.user_id = auth.uid()
        and mine.role = 'student'
        and theirs.user_id = profiles.id
        and theirs.role = 'student'
    )
  );

-- Pods are for students: only they see a class's pods and pod members.
create or replace function public.pod_in_my_class(target_pod uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pairings p
    join class_memberships cm on cm.class_id = p.class_id
    where p.id = target_pod
      and cm.user_id = auth.uid()
      and cm.role = 'student'
  );
$$;

drop policy "read pods in my classes" on public.pairings;
create policy "read pods in my classes" on public.pairings
  for select to authenticated
  using (public.is_class_student(class_id));

-- Starting a pod: members only (as before), and not organizers (SP003 →
-- errors.organizerNoPod in the app).
create or replace function public.create_pod(target_class uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pod uuid;
begin
  if auth.uid() is null or not public.is_class_member(target_class) then
    raise exception 'not a member of this class' using errcode = '42501';
  end if;

  if not public.is_class_student(target_class) then
    raise exception 'organizers are not in pods' using errcode = 'SP003';
  end if;

  insert into pairings (class_id) values (target_class) returning id into new_pod;
  -- The pod-member triggers fire here; if one raises, the pod rolls back too.
  insert into pairing_members (pairing_id, user_id) values (new_pod, auth.uid());

  return new_pod;
end;
$$;

-- The backstop for every way into a pod (create_pod, accept_pod_invitation,
-- the project owner): a pod member must be a student of the pod's class.
create or replace function public.enforce_pod_member_is_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from pairings p
    join class_memberships cm on cm.class_id = p.class_id
    where p.id = new.pairing_id
      and cm.user_id = new.user_id
      and cm.role = 'student'
  ) then
    raise exception 'only students of the class can be in its pods' using errcode = 'SP003';
  end if;
  return new;
end;
$$;

create trigger pairing_members_student_only
  before insert on public.pairing_members
  for each row execute function public.enforce_pod_member_is_student();

-- Asking to join a pod, and being invited: students only.
drop policy "request to join a pod" on public.pod_invitations;
create policy "request to join a pod" on public.pod_invitations
  for insert to authenticated
  with check (
    kind = 'request'
    and inviter_id = auth.uid()
    and invitee_id = auth.uid()
    and public.is_class_student(class_id)
  );

drop policy "send an invite" on public.pod_invitations;
create policy "send an invite" on public.pod_invitations
  for insert to authenticated
  with check (
    kind = 'invite'
    and inviter_id = auth.uid()
    and public.is_pod_member(pod_id)
    and exists (
      select 1 from class_memberships cm
      where cm.class_id = pod_invitations.class_id
        and cm.user_id = pod_invitations.invitee_id
        and cm.role = 'student'
    )
  );

-- Targets only in classes you study in.
drop policy "insert own targets in my classes" on public.targets;
create policy "insert own targets in my classes" on public.targets
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_class_student(class_id));

drop policy "update own targets in my classes" on public.targets;
create policy "update own targets in my classes" on public.targets
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_class_student(class_id));


-- =============================================================================
-- 3. TIDY-UP
-- =============================================================================

-- Policies that applied to all roles: signed-in users only from now on.
alter policy "send nudges to podmates only" on public.nudges to authenticated;
alter policy "read own nudges" on public.nudges to authenticated;
alter policy "read own pod memberships" on public.pairing_members to authenticated;
alter policy "read pod members in my classes" on public.pairing_members to authenticated;
alter policy "read own pairings" on public.pairings to authenticated;
alter policy "read invitations i'm party to" on public.pod_invitations to authenticated;
alter policy "act on an invitation" on public.pod_invitations to authenticated;
alter policy "read own profile" on public.profiles to authenticated;
alter policy "update own profile" on public.profiles to authenticated;
alter policy "comment on visible logs as yourself" on public.progress_comments to authenticated;
alter policy "delete own comments" on public.progress_comments to authenticated;
alter policy "read comments on visible logs" on public.progress_comments to authenticated;
alter policy "insert own progress" on public.progress_logs to authenticated;
alter policy "delete own progress" on public.progress_logs to authenticated;
alter policy "read own and podmates progress in that class" on public.progress_logs to authenticated;
alter policy "update own progress" on public.progress_logs to authenticated;
alter policy "delete own targets" on public.targets to authenticated;
alter policy "read own and podmates targets in that class" on public.targets to authenticated;

-- RLS helpers and signed-in actions: not callable without signing in.
revoke execute on function public.is_class_member(uuid) from public, anon;
revoke execute on function public.is_class_student(uuid) from public, anon;
revoke execute on function public.is_pod_member(uuid) from public, anon;
revoke execute on function public.pod_in_my_class(uuid) from public, anon;
revoke execute on function public.shares_pod(uuid, uuid) from public, anon;
revoke execute on function public.is_podmate_in_class(uuid, uuid) from public, anon;
revoke execute on function public.can_see_target(uuid) from public, anon;
revoke execute on function public.can_see_progress_log(uuid) from public, anon;
revoke execute on function public.accept_pod_invitation(uuid) from public, anon;
revoke execute on function public.create_pod(uuid) from public, anon;
revoke execute on function public.join_class_by_code(text) from public, anon;
revoke execute on function public.class_by_join_code(text) from public, anon;

-- The new helper, like the others: policies call it as the signed-in user.
grant execute on function public.is_class_student(uuid) to authenticated;

-- Trigger functions: never called directly by anyone.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.stamp_name_chosen() from public, anon, authenticated;
revoke execute on function public.enforce_nudge_limit() from public, anon, authenticated;
revoke execute on function public.add_creator_membership() from public, anon, authenticated;
revoke execute on function public.enforce_pod_member_is_student() from public, anon, authenticated;

-- Unused since 0013 (no policy, function or app code calls it).
drop function public.is_podmate(uuid);


-- =============================================================================
-- VERIFY
--   select pol.polname from pg_policy pol
--   join pg_class c on c.oid = pol.polrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and pol.polroles = '{0}';
--   -- no rows: no policy in public applies to all roles any more
-- Then run supabase/tests/rls_class_organizers.sql and the four older files.
-- =============================================================================
