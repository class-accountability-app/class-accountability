-- =============================================================================
-- 0013_join_code_only.sql — the join code is the only way into a class;
-- targets (and what podmates see of them) stay inside their class
-- =============================================================================
--
-- 1. CLASSES ARE VISIBLE ONLY TO THEIR MEMBERS (and whoever created them).
--    Anyone else sees a class only through class_by_join_code (0012): name,
--    term and member count, never names or ids of members. A student who
--    creates a class becomes its first member automatically.
--
-- 2. JOINING ONLY WITH THE CODE. The direct INSERT policy on
--    class_memberships is dropped, and so is the UPDATE policy: it only checked
--    user_id, so a student could move their own membership row to any class
--    (class_id) and join it without a code. join_class_by_code() is the only
--    way in. Nothing in the app updates memberships.
--
-- 3. TARGETS ONLY IN YOUR OWN CLASSES. Insert and update both require
--    membership of the target's class, and a target's class can never change
--    afterwards (moving a target would also move its progress logs to another
--    pod's view).
--
-- 4. PODMATES SEE EACH OTHER'S WORK ONLY WITHIN THE POD'S CLASS. is_podmate()
--    ignores the class, so a podmate in class K could read my targets,
--    progress logs and comments from class L, and my pod membership there.
--    Targets, progress logs and comments now use is_podmate_in_class(); your
--    own pod-membership rows stay visible to you, and every pod in your classes
--    stays visible through "read pod members in my classes" (0006).
--
-- No new tables. Tests: supabase/tests/rls_join_code_only.sql.
-- =============================================================================


-- =============================================================================
-- 1. CLASSES: VISIBLE TO MEMBERS AND THE CREATOR
-- =============================================================================

drop policy "authenticated users can read classes" on public.classes;

-- created_by keeps `insert ... returning` working for the creator: RETURNING
-- is checked against this policy before the AFTER trigger below adds the
-- membership.
create policy "read my classes" on public.classes
  for select to authenticated
  using (public.is_class_member(id) or created_by = auth.uid());

-- The creator becomes the first member. Only for a student's own insert
-- (auth.uid() = created_by), so inserts by the project owner (seed data, the
-- RLS tests' setup) add nobody.
create or replace function public.add_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null and new.created_by = auth.uid() then
    insert into class_memberships (user_id, class_id)
    values (new.created_by, new.id)
    on conflict (user_id, class_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.add_creator_membership() from public, anon, authenticated;

create trigger classes_add_creator_membership
  after insert on public.classes
  for each row execute function public.add_creator_membership();


-- =============================================================================
-- 2. MEMBERSHIPS ONLY THROUGH THE CODE
-- =============================================================================

drop policy "join a class as yourself" on public.class_memberships;
drop policy "update own membership" on public.class_memberships;

-- The class id for a valid code (joining it if needed), or null for an
-- unknown code. Joining a class you're already in is a success, not an error.
-- Accepts the code in any case, with spaces or hyphens, like class_by_join_code.
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

  insert into class_memberships (user_id, class_id)
  values (auth.uid(), target_class)
  on conflict (user_id, class_id) do nothing;

  return target_class;
end;
$$;

revoke execute on function public.join_class_by_code(text) from public, anon;
grant execute on function public.join_class_by_code(text) to authenticated;


-- =============================================================================
-- 3. TARGETS ONLY IN YOUR OWN CLASSES, AND THEY STAY THERE
-- =============================================================================

drop policy "insert own targets" on public.targets;
create policy "insert own targets in my classes" on public.targets
  for insert
  with check (user_id = auth.uid() and public.is_class_member(class_id));

drop policy "update own targets" on public.targets;
create policy "update own targets in my classes" on public.targets
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_class_member(class_id));

-- For everyone, the project owner included: nothing needs to move a target.
create or replace function public.keep_target_class()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.class_id is distinct from old.class_id then
    raise exception 'a target''s class cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_target_class() from public, anon, authenticated;

create trigger targets_keep_class
  before update on public.targets
  for each row execute function public.keep_target_class();


-- =============================================================================
-- 4. PODMATES SEE EACH OTHER'S WORK ONLY WITHIN THE POD'S CLASS
--
-- Same shape and the same `status = 'active'` condition as is_podmate()
-- (0001), plus the pod's class. These helpers keep the default EXECUTE
-- grants, like the existing RLS helpers: policies call them as the querying
-- role, and without EXECUTE a query would fail instead of returning no rows.
-- =============================================================================

create or replace function public.is_podmate_in_class(target_user uuid, target_class uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from pairing_members me
    join pairing_members them on them.pairing_id = me.pairing_id
    join pairings p on p.id = me.pairing_id
    where me.user_id = auth.uid()
      and them.user_id = target_user
      and p.status = 'active'
      and p.class_id = target_class
  );
$$;

-- Can I see this target: mine, or a podmate's in the pod's own class.
create or replace function public.can_see_target(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from targets t
    where t.id = target
      and (t.user_id = auth.uid() or public.is_podmate_in_class(t.user_id, t.class_id))
  );
$$;

drop policy "read own and podmates targets" on public.targets;
create policy "read own and podmates targets in that class" on public.targets
  for select
  using (user_id = auth.uid() or public.is_podmate_in_class(user_id, class_id));

-- A progress log belongs to its target's owner (0009), so "can I see its
-- target" decides it.
drop policy "read own and podmates progress" on public.progress_logs;
create policy "read own and podmates progress in that class" on public.progress_logs
  for select
  using (user_id = auth.uid() or public.can_see_target(target_id));

-- Comments (0008): the same rule for reading and for writing a comment.
create or replace function public.can_see_progress_log(target_log uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from progress_logs pl
    where pl.id = target_log
      and (pl.user_id = auth.uid() or public.can_see_target(pl.target_id))
  );
$$;

-- Your own pod memberships, in any class. Everyone's memberships in pods of
-- your classes stay visible through "read pod members in my classes" (0006).
drop policy "read own pod members" on public.pairing_members;
create policy "read own pod memberships" on public.pairing_members
  for select
  using (user_id = auth.uid());


-- =============================================================================
-- VERIFY
--   select polname from pg_policy
--   where polrelid = 'public.class_memberships'::regclass and polcmd in ('a', 'w');
--   -- no rows
-- Then run supabase/tests/rls_join_code_only.sql and the two older files.
-- =============================================================================
