`-- =============================================================================
-- 0001_init.sql — Initial schema for the Class-Scoped Accountability App
-- =============================================================================
--
-- READ THIS BEFORE RUNNING:
--
-- Every table below has Row Level Security ENABLED and explicit policies.
-- A table with RLS disabled is readable by anyone holding the anon key — which
-- is shipped to every browser that loads the site. That is not a theoretical
-- risk; it is the single most common way a Supabase app leaks data, and it
-- looks completely fine while you test as yourself.
--
-- The core rule of this app: you can see a person's progress ONLY if you are in
-- a pod with them. Everything below exists to enforce that in the database, so
-- that a bug in the app code cannot bypass it.
--
-- STRUCTURE: tables first, then the helper function, then policies. A policy is
-- validated at creation time, so every table it references must already exist.
--
-- =============================================================================


-- =============================================================================
-- SECTION 1 — TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — public-facing user data
--
-- Supabase already stores auth data (email, password hashes, sessions) in the
-- private auth.users table. Never touch that directly. This table holds the
-- app-level profile and links to it by id.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 50),
  university    text,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- -----------------------------------------------------------------------------
-- classes
-- -----------------------------------------------------------------------------
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  university  text not null,
  term        text not null,          -- e.g. '2026-Fall'. Gives pairings a natural end.
  created_by  uuid references public.profiles(id) on delete set null,
  is_pilot    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.classes enable row level security;


-- -----------------------------------------------------------------------------
-- class_memberships — who is in which class
--
-- `status` is the churn signal: flipped to 'inactive' after N days with no
-- progress logged. Display-only in MVP; no auto re-pairing.
-- -----------------------------------------------------------------------------
create table public.class_memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  joined_at  timestamptz not null default now(),
  unique (user_id, class_id)   -- can't join the same class twice
);

alter table public.class_memberships enable row level security;

create index on public.class_memberships (class_id);
create index on public.class_memberships (user_id);


-- -----------------------------------------------------------------------------
-- pairings + pairing_members — the pods
--
-- A pod is a group of (target) 3 people within one class. Modelled as a join
-- table rather than an array column, so that RLS policies can actually query it.
-- -----------------------------------------------------------------------------
create table public.pairings (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  status      text not null default 'active'
              check (status in ('active', 'needs_rematch', 'ended')),
  created_at  timestamptz not null default now()
);

alter table public.pairings enable row level security;

create table public.pairing_members (
  pairing_id  uuid not null references public.pairings(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (pairing_id, user_id)
);

alter table public.pairing_members enable row level security;

create index on public.pairing_members (user_id);


-- -----------------------------------------------------------------------------
-- targets — what someone is working toward
--
-- Without a target (an amount + a deadline), "will you finish in time?" has
-- nothing to project against. This is the object that makes the estimate possible.
-- -----------------------------------------------------------------------------
create table public.targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  class_id       uuid not null references public.classes(id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  target_type    text not null check (target_type in ('task', 'word_count', 'study_hours')),
  target_amount  numeric check (target_amount is null or target_amount > 0),
  deadline       date,
  google_doc_id  text,   -- null unless Google Docs auto-tracking is connected
  created_at     timestamptz not null default now()
);

alter table public.targets enable row level security;

create index on public.targets (user_id);


-- -----------------------------------------------------------------------------
-- progress_logs — the core mechanic
--
-- `source` distinguishes manual entries from Google Docs auto-tracking.
-- Manual is the default and works for any task type; Google Docs is the bonus
-- layer for report/essay work only.
-- -----------------------------------------------------------------------------
create table public.progress_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  target_id       uuid not null references public.targets(id) on delete cascade,
  source          text not null default 'manual' check (source in ('manual', 'google_docs')),
  progress_value  numeric not null,   -- words written, hours studied, or 1 for "done"
  description     text check (description is null or char_length(description) <= 280),
  logged_at       timestamptz not null default now()
);

alter table public.progress_logs enable row level security;

create index on public.progress_logs (target_id, logged_at desc);
create index on public.progress_logs (user_id);


-- -----------------------------------------------------------------------------
-- nudges — the one, deliberately minimal interaction channel
--
-- This is the ONLY user-to-user text in the app. It is therefore the only
-- possible abuse vector, which is why: hard 280-char cap, no rich content,
-- no reply chains, and it can only be sent to a podmate.
-- -----------------------------------------------------------------------------
create table public.nudges (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  pairing_id    uuid not null references public.pairings(id) on delete cascade,
  type          text not null check (type in ('reaction', 'question_prompt')),
  content       text check (content is null or char_length(content) <= 280),
  created_at    timestamptz not null default now(),
  check (from_user_id <> to_user_id)   -- no nudging yourself
);

alter table public.nudges enable row level security;

create index on public.nudges (to_user_id, created_at desc);


-- =============================================================================
-- SECTION 2 — HELPER FUNCTION
--
-- This predicate is the heart of the app's privacy model, so it lives in ONE
-- place. Every "can I see this?" policy calls it. If the rule ever changes, it
-- changes here — not in six copy-pasted subqueries that quietly drift apart.
--
-- SECURITY DEFINER + a locked search_path: the function reads pairing_members
-- with the definer's rights. Without this, a policy ON pairing_members that
-- needs to QUERY pairing_members would recurse infinitely.
-- =============================================================================

create or replace function public.is_podmate(target_user uuid)
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
  );
$$;


-- =============================================================================
-- SECTION 3 — POLICIES
--
-- RLS enabled with no policy = deny everything. Each table below needs at least
-- a SELECT policy and an INSERT policy or it is effectively locked shut.
-- =============================================================================

-- --- profiles ----------------------------------------------------------------

create policy "read own profile"
  on public.profiles for select
  using (id = auth.uid());

-- Read the profile of anyone in a class you're also in.
-- (Needed to show podmates' names. Scoped to shared classes, not the whole table.)
create policy "read classmates profiles"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.class_memberships mine
      join public.class_memberships theirs
        on theirs.class_id = mine.class_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

create policy "insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());


-- --- classes -----------------------------------------------------------------

-- Any signed-in user can browse classes (you have to find one before you join it).
create policy "authenticated users can read classes"
  on public.classes for select
  to authenticated
  using (true);

create policy "authenticated users can create classes"
  on public.classes for insert
  to authenticated
  with check (created_by = auth.uid());


-- --- class_memberships -------------------------------------------------------

-- You can see who else is in a class you're in.
create policy "read memberships of my classes"
  on public.class_memberships for select
  using (
    exists (
      select 1 from public.class_memberships mine
      where mine.user_id = auth.uid()
        and mine.class_id = class_memberships.class_id
    )
  );

create policy "join a class as yourself"
  on public.class_memberships for insert
  with check (user_id = auth.uid());

create policy "update own membership"
  on public.class_memberships for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- --- pairings ----------------------------------------------------------------

-- You can see a pod if you're in it.
create policy "read own pairings"
  on public.pairings for select
  using (
    exists (
      select 1 from public.pairing_members pm
      where pm.pairing_id = pairings.id
        and pm.user_id = auth.uid()
    )
  );


-- --- pairing_members ---------------------------------------------------------

-- You can see the members of your own pod (yourself, or a podmate).
create policy "read own pod members"
  on public.pairing_members for select
  using (
    user_id = auth.uid() or public.is_podmate(user_id)
  );


-- --- targets -----------------------------------------------------------------

create policy "read own and podmates targets"
  on public.targets for select
  using (user_id = auth.uid() or public.is_podmate(user_id));

create policy "insert own targets"
  on public.targets for insert
  with check (user_id = auth.uid());

create policy "update own targets"
  on public.targets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own targets"
  on public.targets for delete
  using (user_id = auth.uid());


-- --- progress_logs -----------------------------------------------------------

-- THE policy that matters. Podmates only. Nobody else, ever.
create policy "read own and podmates progress"
  on public.progress_logs for select
  using (user_id = auth.uid() or public.is_podmate(user_id));

create policy "insert own progress"
  on public.progress_logs for insert
  with check (user_id = auth.uid());

create policy "delete own progress"
  on public.progress_logs for delete
  using (user_id = auth.uid());


-- --- nudges ------------------------------------------------------------------

-- You can read nudges you sent or received. Nobody else's.
create policy "read own nudges"
  on public.nudges for select
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- You can only send as yourself, and only to a podmate.
create policy "send nudges to podmates only"
  on public.nudges for insert
  with check (
    from_user_id = auth.uid()
    and public.is_podmate(to_user_id)
  );


-- =============================================================================
-- SECTION 4 — AUTO-CREATE A PROFILE ON SIGNUP
--
-- Without this, a new user exists in auth.users but has no row in profiles, and
-- every policy above that joins to profiles quietly returns nothing. The user
-- signs in successfully and then sees an empty, broken app.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- VERIFY BEFORE YOU TRUST THIS
--
-- Run this. Every row must show rls_enabled = true. If any row says false,
-- that table is public and you have a leak.
--
--   select tablename, rowsecurity as rls_enabled
--   from pg_tables
--   where schemaname = 'public'
--   order by tablename;
--
-- Then do the test that actually matters: sign in as a SECOND user who is not
-- in your pod, and confirm you cannot see the first user's progress_logs.
-- "It works for me" proves nothing about isolation.
-- =============================================================================`