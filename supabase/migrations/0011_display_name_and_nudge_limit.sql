-- =============================================================================
-- 0011_display_name_and_nudge_limit.sql — Chosen display names, and the nudge
-- rules enforced by the database instead of only by the server action
-- =============================================================================
--
-- PROFILES
--   * name_chosen_at: null while display_name is still the auto-filled email
--     local part. The app sends students with a null here to /welcome.
--   * Name rules the database can express exactly (trimmed, no control
--     characters) plus a code-point backstop. The "1 to 20 graphemes" rule is
--     the app's (Intl.Segmenter); Postgres cannot count graphemes.
--   * Clients may update display_name on their own row and nothing else.
--
-- NUDGES
--   * At most 3 from the same sender to the same recipient in a rolling 24
--     hours, checked in a trigger so the anon key can't bypass it.
--   * The insert policy now also checks pairing_id: it must be an active pod
--     that BOTH sender and recipient are in.
--
-- No new tables, so no new RLS to enable.
-- =============================================================================


-- =============================================================================
-- 1. Has the student chosen a name?
-- =============================================================================

-- Set by the trigger in section 4, never by the client (section 5 grants the
-- client display_name only), so it can't be faked or cleared.
alter table public.profiles add column name_chosen_at timestamptz;

-- Backfill: a name that differs from the email's local part was chosen by the
-- student. Runs before the trigger below exists, so it doesn't stamp now().
update public.profiles p
set name_chosen_at = p.created_at
from auth.users u
where u.id = p.id
  and p.display_name <> split_part(u.email, '@', 1);


-- =============================================================================
-- 2. Name rules
--
-- The 0001 check (1 to 50 characters) was created without a name. Look it up
-- by definition instead of assuming Postgres's generated name (same approach
-- as 0010), then add the new rules under an explicit name.
--
--   * trimmed: no leading/trailing whitespace, including the full-width space
--     U+3000 that Japanese keyboards type (JS trim() strips it too)
--   * no control characters (newlines, tabs, NUL...)
--   * 1 to 80 code points: a backstop, not the real rule. 20 graphemes of up
--     to 4 code points each (emoji with a skin tone or ZWJ, kana + combining
--     dakuten). A strict char_length <= 20 would reject names the app accepts.
-- =============================================================================

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%display_name%';

  if constraint_name is null then
    raise exception 'Could not find the display_name CHECK constraint on public.profiles';
  end if;

  execute format('alter table public.profiles drop constraint %I', constraint_name);
end $$;

alter table public.profiles
  add constraint profiles_display_name_rules check (
    char_length(display_name) between 1 and 80
    and display_name !~ '^[\s　]|[\s　]$'
    and display_name !~ '[[:cntrl:]]'
  );


-- =============================================================================
-- 3. Signup: the starting name is always the email local part
--
-- raw_user_meta_data is whatever the client passes to signInWithOtp
-- (options.data), and the app never sends any, so stop trusting it: a bad value
-- there would fail the rules above and look like a "wrong domain" error.
-- left(…, 20) keeps a long local part inside the rules. Domain check unchanged
-- from 0007.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domain text := 'andrew.ac.jp';
begin
  if lower(split_part(new.email, '@', 2)) <> allowed_domain then
    raise exception 'Signup is limited to % email addresses.', allowed_domain
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(split_part(new.email, '@', 1), 20));
  return new;
end;
$$;


-- =============================================================================
-- 4. Saving a name marks it as chosen
--
-- "before update OF display_name" fires whenever display_name is in the SET
-- list, even when the value is the same. So a student who keeps "23b1808" on
-- the welcome screen has still chosen it, and isn't sent back there.
-- =============================================================================

create or replace function public.stamp_name_chosen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name_chosen_at := now();
  return new;
end;
$$;

create trigger profiles_stamp_name_chosen
  before update of display_name on public.profiles
  for each row execute function public.stamp_name_chosen();


-- =============================================================================
-- 5. Clients may change only display_name, only on their own row
--
-- The RLS policy "update own profile" (0001) picks the row; column privileges
-- pick the column. Profiles are created only by handle_new_user (security
-- definer), so clients need no INSERT at all, and its policy goes too.
-- =============================================================================

revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "insert own profile" on public.profiles;


-- =============================================================================
-- 6. Nudges: sender and recipient must share the pod named in pairing_id
--
-- 0001 checked is_podmate(to_user_id) only, so a nudge could carry any
-- pairing_id, e.g. a pod neither of them is in. Same SECURITY DEFINER pattern
-- as is_podmate: reading pairing_members from a policy without recursing.
-- =============================================================================

create or replace function public.shares_pod(target_user uuid, target_pod uuid)
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
    where me.pairing_id = target_pod
      and me.user_id = auth.uid()
      and them.user_id = target_user
      and p.status = 'active'
  );
$$;

drop policy if exists "send nudges to podmates only" on public.nudges;

create policy "send nudges to podmates only"
  on public.nudges for insert
  with check (
    from_user_id = auth.uid()
    and public.shares_pod(to_user_id, pairing_id)
  );


-- =============================================================================
-- 7. Nudges: at most 3 per sender→recipient in a rolling 24 hours
--
-- SECURITY INVOKER: the sender can already read the nudges they sent ("read
-- own nudges"), which is exactly what the count needs. An insert claiming
-- someone else's from_user_id is refused by the policy above anyway.
-- =============================================================================

create index nudges_pair_recent_idx
  on public.nudges (from_user_id, to_user_id, created_at desc);

create or replace function public.enforce_nudge_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recent integer;
begin
  -- The window is measured by the server clock. A client-sent created_at
  -- (e.g. backdated a year) would otherwise fall outside it.
  new.created_at := now();

  -- Two sends for the same pair at the same instant would both count 2 and
  -- both insert. This lock makes the second wait until the first commits.
  perform pg_advisory_xact_lock(
    hashtextextended(new.from_user_id::text || ':' || new.to_user_id::text, 0)
  );

  select count(*) into recent
  from public.nudges
  where from_user_id = new.from_user_id
    and to_user_id = new.to_user_id
    and created_at > now() - interval '24 hours';

  if recent >= 3 then
    raise exception 'Nudge limit reached: 3 per recipient per 24 hours.'
      using errcode = 'SP001';  -- lib/errors.ts maps this to errors.nudgeLimit
  end if;

  return new;
end;
$$;

create trigger nudges_enforce_limit
  before insert on public.nudges
  for each row execute function public.enforce_nudge_limit();


-- =============================================================================
-- VERIFY: supabase/tests/rls_display_name_nudges.sql (one transaction, ends in
-- ROLLBACK). See "RLS tests" in CLAUDE.md.
-- =============================================================================
