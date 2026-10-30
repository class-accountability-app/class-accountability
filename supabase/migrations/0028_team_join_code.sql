-- 0028: team join code and QR (project first, docs/plans/project-first-plan.md).
--
-- Teams usually form face to face in class, so a pod gets its own code: a
-- member shows the QR (or reads the code aloud) and a classmate joins in one
-- tap, with no invitation round trip.
--
-- 1. pod_join_codes: one 8-character code per pod (the class code's alphabet:
--    no 0/O, 1/I/L). A separate table, not a column on pairings, because every
--    classmate can read pairings ("read pods in my classes") and the code is
--    what lets someone in: only the pod's own members may read it. No client
--    writes: a trigger gives every new pod a code, and new_pod_join_code()
--    replaces it.
-- 2. pod_by_join_code(code): what the join page shows: class name, member
--    count, whether I'm already in. No names.
-- 3. join_pod_by_code(code): joins the pod. Someone who isn't in the class yet
--    joins it as a student first (the code came from a classmate in person,
--    the same trust as the class code). Organizers can't (SP003), one pod per
--    class still holds (SP002, 0012's trigger), and a pod of 6 is full (SP014).
--    An unknown code is SP015.
--
-- Error codes: lib/errors.ts DB_CODES. Test: supabase/tests/rls_team_join_code.sql.

-- =============================================================================
-- 1. The codes
-- =============================================================================
create table public.pod_join_codes (
  pod_id     uuid primary key references public.pairings(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now(),
  constraint pod_join_codes_format check (code ~ '^[A-HJKMNP-Z2-9]{8}$')
);

alter table public.pod_join_codes enable row level security;

create policy "members read their pod's code"
  on public.pod_join_codes for select to authenticated
  using ( public.is_pod_member(pod_id) );

revoke all on public.pod_join_codes from anon, authenticated;
grant select on public.pod_join_codes to authenticated;

-- Unique across pods and classes, so a code can never mean two things.
create or replace function public.generate_pod_join_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from pod_join_codes j where j.code = candidate)
          and not exists (select 1 from classes c where c.join_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.add_pod_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pod_join_codes (pod_id, code) values (new.id, public.generate_pod_join_code());
  return new;
end;
$$;

create trigger pairings_add_join_code
  after insert on public.pairings
  for each row execute function public.add_pod_join_code();

-- Existing pods get a code too.
insert into public.pod_join_codes (pod_id, code)
select p.id, public.generate_pod_join_code()
from public.pairings p
where not exists (select 1 from public.pod_join_codes c where c.pod_id = p.id);

-- =============================================================================
-- 2. What the join page shows
-- =============================================================================
create or replace function public.pod_by_join_code(code text)
returns table (pod_id uuid, class_id uuid, class_name text, member_count integer, is_member boolean, in_class boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, c.id, c.name,
         (select count(*)::integer from pairing_members pm where pm.pairing_id = p.id),
         exists (select 1 from pairing_members pm where pm.pairing_id = p.id and pm.user_id = auth.uid()),
         exists (select 1 from class_memberships cm where cm.class_id = c.id and cm.user_id = auth.uid())
  from pod_join_codes j
  join pairings p on p.id = j.pod_id and p.status = 'active'
  join classes c on c.id = p.class_id
  -- Qualified: in a SQL function a bare `code` would mean the column.
  where auth.uid() is not null
    and j.code = upper(regexp_replace(pod_by_join_code.code, '[\s-]', '', 'g'));
$$;

-- =============================================================================
-- 3. Joining
-- =============================================================================
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
  if members >= 6 then
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

-- A member can replace the code (say it was posted somewhere public).
create or replace function public.new_pod_join_code(target_pod uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fresh text;
begin
  if not public.is_pod_member(target_pod) then
    raise exception 'not a member of this pod' using errcode = '42501';
  end if;
  fresh := public.generate_pod_join_code();
  update pod_join_codes set code = fresh, created_at = now() where pod_id = target_pod;
  return fresh;
end;
$$;

revoke execute on function public.generate_pod_join_code() from public, anon, authenticated;
revoke execute on function public.add_pod_join_code() from public, anon, authenticated;
revoke execute on function public.pod_by_join_code(text) from public, anon;
revoke execute on function public.join_pod_by_code(text) from public, anon;
revoke execute on function public.new_pod_join_code(uuid) from public, anon;
grant execute on function public.pod_by_join_code(text) to authenticated;
grant execute on function public.join_pod_by_code(text) to authenticated;
grant execute on function public.new_pod_join_code(uuid) to authenticated;
