-- =============================================================================
-- 0012_class_links_and_one_pod.sql — class join codes, one pod per class
-- =============================================================================
--
-- 1. JOIN CODES. Every class gets an 8-character code for
--    https://www.study-pods.org/join/{code} and its QR code. Codes are not
--    secrets (they go on a classroom screen); they only save typing. The
--    alphabet leaves out look-alikes (0/O, 1/I/L) so a code read from the back
--    of a room is unambiguous. The server always picks the code: a client can
--    neither choose one on insert nor change it later.
--
-- 2. ONE ACTIVE POD PER CLASS PER STUDENT (decision logged in Notion).
--    pairing_members has no class_id, so a unique index can't express the
--    rule; a trigger checks it under an advisory lock (see below).
--
-- 3. PODS ARE CREATED AND JOINED ONLY THROUGH DEFINER FUNCTIONS.
--    Before this, "join a pod as yourself" let any signed-in user insert
--    themselves into ANY pod whose id they knew, skipping invitations, and
--    createPod was two separate inserts that could leave an empty pod. Now:
--    create_pod() creates the pod and its first member in one transaction,
--    accept_pod_invitation() (0004) is the only way into an existing pod, and
--    the two direct INSERT policies are dropped.
--
-- 4. INVITATIONS: at most one PENDING row per person per pod. The old
--    unique (pod_id, invitee_id, status) also blocked a second 'declined'
--    row, so declining the same person twice failed.
--
-- No new tables, so no new RLS to enable. Tests: supabase/tests/rls_class_link_pods.sql.
-- =============================================================================


-- =============================================================================
-- 1. JOIN CODES
-- =============================================================================

-- SECURITY DEFINER + pinned search_path: the "is this code taken?" check must
-- see every class, including ones the caller can't read (a follow-up makes
-- classes visible only to their members). The unique constraint below is the
-- backstop if two inserts ever pick the same code at the same moment.
-- random() is fine: codes are not secrets.
create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from classes where join_code = code);
  end loop;
  return code;
end;
$$;

-- Only the trigger below calls it. (Supabase grants EXECUTE on new functions
-- to anon and authenticated explicitly, so revoke from them too, not just PUBLIC.)
revoke execute on function public.generate_join_code() from public, anon, authenticated;

alter table public.classes add column join_code text;

update public.classes set join_code = public.generate_join_code() where join_code is null;

alter table public.classes
  alter column join_code set not null,
  add constraint classes_join_code_key unique (join_code),
  add constraint classes_join_code_format check (join_code ~ '^[A-HJKMNP-Z2-9]{8}$');

-- Whatever a client sends as join_code on insert is replaced. Definer so it
-- may call generate_join_code (EXECUTE is revoked from client roles).
create or replace function public.set_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.join_code := public.generate_join_code();
  return new;
end;
$$;

revoke execute on function public.set_join_code() from public, anon, authenticated;

create trigger classes_set_join_code
  before insert on public.classes
  for each row execute function public.set_join_code();

-- A client can't change the code afterwards either. There is no UPDATE
-- policy on classes today, so RLS already refuses; this keeps it true if one
-- is added later. (A column-level REVOKE wouldn't work: Supabase grants UPDATE
-- on the whole table, and a table grant overrides column revokes.) Only the
-- client roles are blocked, so the project owner can still rotate a code.
create or replace function public.keep_join_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.join_code is distinct from old.join_code
     and current_user in ('anon', 'authenticated') then
    raise exception 'join_code cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_join_code() from public, anon, authenticated;

create trigger classes_keep_join_code
  before update on public.classes
  for each row execute function public.keep_join_code();

-- Screen 04 for someone who isn't in the class yet: name, term, member count.
-- No names. Definer because a non-member can't count class_memberships under
-- RLS. Accepts the code in any case, with spaces or hyphens ("k7m3-q9tx").
create or replace function public.class_by_join_code(code text)
returns table (
  id uuid,
  name text,
  university text,
  term text,
  member_count bigint,
  is_member boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.name, c.university, c.term,
         (select count(*) from class_memberships cm where cm.class_id = c.id),
         exists (
           select 1 from class_memberships cm
           where cm.class_id = c.id and cm.user_id = auth.uid()
         )
  from classes c
  where c.join_code = upper(regexp_replace(code, '[\s-]', '', 'g'));
$$;

revoke execute on function public.class_by_join_code(text) from public, anon;
grant execute on function public.class_by_join_code(text) to authenticated;


-- =============================================================================
-- 2. ONE ACTIVE POD PER CLASS PER STUDENT
--
-- Concurrency: two inserts for the same student and class (e.g. accepting two
-- invitations at once) both take the same transaction-scoped advisory lock,
-- so the second waits until the first commits. Its EXISTS check then runs
-- with a fresh snapshot (READ COMMITTED takes one per statement), sees the
-- first row and fails. The lock is per (student, class), so unrelated joins
-- never wait on each other.
--
-- Only INSERT is checked: no client can update pairings.status (there is no
-- UPDATE policy), so an ended pod can't be reactivated around this.
-- Existing rows are not re-checked, so this doesn't fail on the one live
-- duplicate; that is cleaned up separately.
-- =============================================================================

create or replace function public.enforce_one_pod_per_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pod_class uuid;
begin
  select class_id into pod_class
  from pairings
  where id = new.pairing_id and status = 'active';

  if pod_class is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || pod_class::text, 0)
  );

  if exists (
    select 1
    from pairing_members pm
    join pairings p on p.id = pm.pairing_id
    where pm.user_id = new.user_id
      and p.class_id = pod_class
      and p.status = 'active'
      and pm.pairing_id <> new.pairing_id
  ) then
    raise exception 'already in a pod in this class'
      using errcode = 'SP002';  -- lib/errors.ts: errors.alreadyInPod / inviteeInPod
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_one_pod_per_class() from public, anon, authenticated;

create trigger one_pod_per_class
  before insert on public.pairing_members
  for each row execute function public.enforce_one_pod_per_class();


-- =============================================================================
-- 3. CREATE A POD AND ITS FIRST MEMBER IN ONE TRANSACTION
-- =============================================================================

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

  insert into pairings (class_id) values (target_class) returning id into new_pod;
  -- The one-pod trigger fires here; if it raises, the pod above rolls back too.
  insert into pairing_members (pairing_id, user_id) values (new_pod, auth.uid());

  return new_pod;
end;
$$;

revoke execute on function public.create_pod(uuid) from public, anon;
grant execute on function public.create_pod(uuid) to authenticated;

drop policy "join a pod as yourself" on public.pairing_members;
drop policy "create pods in my classes" on public.pairings;


-- =============================================================================
-- 4. ONE PENDING INVITATION PER PERSON PER POD
-- =============================================================================

alter table public.pod_invitations
  drop constraint pod_invitations_pod_id_invitee_id_status_key;

create unique index pod_invitations_one_pending
  on public.pod_invitations (pod_id, invitee_id)
  where status = 'pending';


-- =============================================================================
-- VERIFY
--   select count(*) from public.classes where join_code is null;   -- 0
--   select polname from pg_policy
--   where polrelid in ('public.pairings'::regclass, 'public.pairing_members'::regclass)
--     and polcmd = 'a';                                             -- no rows
-- Then run supabase/tests/rls_class_link_pods.sql.
-- =============================================================================
