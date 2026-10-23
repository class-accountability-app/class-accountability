-- =============================================================================
-- 0024_meeting_polls.sql — Rallly-style polls to pick a check-up meeting time
-- =============================================================================
-- Plan: docs/plans/automation-plan.md (section 2). Mockup:
-- docs/mockups/phase4/automation.html (views poll, vote, meeting).
--
-- A pod member suggests 2–8 times for a meeting. Everyone in the pod answers
-- each time with yes / maybe / no (○ △ ✕). Any member then confirms one time,
-- or cancels the poll. A confirmed poll is the meeting; its page shows each
-- member's latest check-in as the agenda (no new data for that).
--
-- WHO SEES WHAT (rule 3)
--   meeting_polls, meeting_poll_options   every member of the project's pod
--   meeting_poll_votes                    every member of the pod (who can come
--                                         when is the point of the poll; it is
--                                         not progress data)
--   Writes: polls and options only through create_meeting_poll(),
--   confirm_meeting_poll() and cancel_meeting_poll(); votes by their own voter,
--   only while the poll is open. Organizers are never pod members (SP003).
--
-- ERROR CODES (next free after SP011)
--   SP012  the poll is no longer open (confirmed or cancelled)
--   SP013  the suggested times are not valid (2–8, distinct, in the future)
--
-- Every table has RLS enabled in this file (rule 1).
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

create table public.meeting_polls (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  created_by        uuid references public.profiles(id) on delete set null,
  title             text not null,
  duration_minutes  integer not null default 30,
  vote_by           timestamptz,
  status            text not null default 'open',
  chosen_option_id  uuid,
  created_at        timestamptz not null default now(),
  constraint meeting_polls_title_length check (
    char_length(btrim(title)) between 1 and 60 and title !~ '[[:cntrl:]]'
  ),
  constraint meeting_polls_duration check (duration_minutes between 15 and 240),
  constraint meeting_polls_status_check check (status in ('open', 'confirmed', 'cancelled')),
  constraint meeting_polls_confirmed_has_choice check ((status = 'confirmed') = (chosen_option_id is not null))
);
alter table public.meeting_polls enable row level security;
create index meeting_polls_project_idx on public.meeting_polls (project_id, created_at desc);

create table public.meeting_poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.meeting_polls(id) on delete cascade,
  starts_at  timestamptz not null,
  constraint meeting_poll_options_once unique (poll_id, starts_at)
);
alter table public.meeting_poll_options enable row level security;

alter table public.meeting_polls
  add constraint meeting_polls_chosen_option_fk
  foreign key (chosen_option_id) references public.meeting_poll_options(id) on delete set null;

create table public.meeting_poll_votes (
  option_id   uuid not null references public.meeting_poll_options(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  answer      text not null,
  updated_at  timestamptz not null default now(),
  primary key (option_id, user_id),
  constraint meeting_poll_votes_answer_check check (answer in ('yes', 'maybe', 'no'))
);
alter table public.meeting_poll_votes enable row level security;
create index meeting_poll_votes_user_idx on public.meeting_poll_votes (user_id);


-- =============================================================================
-- 2. HELPERS (security definer, so policies don't recurse)
-- =============================================================================

-- Am I in the pod of this poll's project?
create or replace function public.is_poll_member(target_poll uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from meeting_polls mp
    where mp.id = target_poll and public.is_project_member(mp.project_id)
  );
$$;

-- May I answer this time? I'm in the pod and the poll is still open.
create or replace function public.can_vote_option(target_option uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from meeting_poll_options o
    join meeting_polls mp on mp.id = o.poll_id
    where o.id = target_option
      and mp.status = 'open'
      and public.is_project_member(mp.project_id)
  );
$$;


-- =============================================================================
-- 3. POLICIES (all `to authenticated`)
-- =============================================================================

create policy "read my pod's meeting polls"
  on public.meeting_polls for select to authenticated
  using ( public.is_project_member(project_id) );

create policy "read my pod's meeting times"
  on public.meeting_poll_options for select to authenticated
  using ( public.is_poll_member(poll_id) );

create policy "read my pod's meeting answers"
  on public.meeting_poll_votes for select to authenticated
  using (
    exists (
      select 1 from public.meeting_poll_options o
      where o.id = meeting_poll_votes.option_id and public.is_poll_member(o.poll_id)
    )
  );

create policy "answer for myself while the poll is open"
  on public.meeting_poll_votes for insert to authenticated
  with check ( user_id = (select auth.uid()) and public.can_vote_option(option_id) );

create policy "change my answer while the poll is open"
  on public.meeting_poll_votes for update to authenticated
  using ( user_id = (select auth.uid()) and public.can_vote_option(option_id) )
  with check ( user_id = (select auth.uid()) and public.can_vote_option(option_id) );

create policy "take back my answer while the poll is open"
  on public.meeting_poll_votes for delete to authenticated
  using ( user_id = (select auth.uid()) and public.can_vote_option(option_id) );


-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- An answer keeps its time and its voter; updated_at follows the server clock.
create or replace function public.keep_meeting_vote_identity()
returns trigger
language plpgsql
as $$
begin
  if new.option_id is distinct from old.option_id or new.user_id is distinct from old.user_id then
    raise exception 'only the answer can change' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger meeting_poll_votes_keep_identity
  before update on public.meeting_poll_votes
  for each row execute function public.keep_meeting_vote_identity();


-- =============================================================================
-- 5. FUNCTIONS (authenticated)
-- =============================================================================

-- A new poll and its times in one transaction. Times are 2–8, distinct and in
-- the future (SP013); the title and duration follow the table's checks.
create or replace function public.create_meeting_poll(
  p_project   uuid,
  p_title     text,
  p_duration  integer,
  p_vote_by   timestamptz,
  p_starts    timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  n       integer := coalesce(cardinality(p_starts), 0);
  new_id  uuid;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.is_project_member(p_project) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  if n < 2 or n > 8
     or (select count(distinct s) from unnest(p_starts) s) <> n
     or exists (select 1 from unnest(p_starts) s where s is null or s <= now()) then
    raise exception 'suggest 2 to 8 different times in the future' using errcode = 'SP013';
  end if;
  if p_vote_by is not null and p_vote_by <= now() then
    raise exception 'the answer-by time has passed' using errcode = 'SP013';
  end if;

  insert into meeting_polls (project_id, created_by, title, duration_minutes, vote_by)
  values (p_project, me, btrim(p_title), coalesce(p_duration, 30), p_vote_by)
  returning id into new_id;

  insert into meeting_poll_options (poll_id, starts_at)
  select new_id, s from unnest(p_starts) s;

  return new_id;
end;
$$;

-- Any member picks the meeting time of an open poll.
create or replace function public.confirm_meeting_poll(p_poll uuid, p_option uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  poll public.meeting_polls;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into poll from meeting_polls where id = p_poll for update;
  if not found or not public.is_project_member(poll.project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  if poll.status <> 'open' then
    raise exception 'this poll is no longer open' using errcode = 'SP012';
  end if;
  if not exists (select 1 from meeting_poll_options o where o.id = p_option and o.poll_id = p_poll) then
    raise exception 'that time is not part of this poll' using errcode = '42501';
  end if;

  update meeting_polls set status = 'confirmed', chosen_option_id = p_option where id = p_poll;
end;
$$;

-- Any member calls off an open or confirmed poll (plans change).
create or replace function public.cancel_meeting_poll(p_poll uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  poll public.meeting_polls;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into poll from meeting_polls where id = p_poll for update;
  if not found or not public.is_project_member(poll.project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  if poll.status = 'cancelled' then
    raise exception 'this poll is no longer open' using errcode = 'SP012';
  end if;

  update meeting_polls set status = 'cancelled', chosen_option_id = null where id = p_poll;
end;
$$;


-- =============================================================================
-- 6. GRANTS
-- =============================================================================

revoke all on public.meeting_polls, public.meeting_poll_options, public.meeting_poll_votes from public, anon;
revoke truncate, references, trigger on public.meeting_polls, public.meeting_poll_options,
  public.meeting_poll_votes from authenticated;
-- Polls and times: read only; written by the functions above.
revoke insert, update, delete on public.meeting_polls, public.meeting_poll_options from authenticated;

revoke execute on function public.is_poll_member(uuid) from public, anon;
revoke execute on function public.can_vote_option(uuid) from public, anon;
revoke execute on function public.create_meeting_poll(uuid, text, integer, timestamptz, timestamptz[]) from public, anon;
revoke execute on function public.confirm_meeting_poll(uuid, uuid) from public, anon;
revoke execute on function public.cancel_meeting_poll(uuid) from public, anon;
grant execute on function public.is_poll_member(uuid) to authenticated;
grant execute on function public.can_vote_option(uuid) to authenticated;
grant execute on function public.create_meeting_poll(uuid, text, integer, timestamptz, timestamptz[]) to authenticated;
grant execute on function public.confirm_meeting_poll(uuid, uuid) to authenticated;
grant execute on function public.cancel_meeting_poll(uuid) to authenticated;

revoke execute on function public.keep_meeting_vote_identity() from public, anon, authenticated;


-- =============================================================================
-- VERIFY: supabase/tests/rls_meeting_polls.sql (run it as in CLAUDE.md "RLS
-- tests"; expect a final row reading 'all RLS tests passed').
-- =============================================================================
