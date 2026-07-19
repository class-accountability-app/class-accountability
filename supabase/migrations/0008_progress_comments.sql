-- =============================================================================
-- 0008_progress_comments.sql — Fenced comments on progress logs
-- =============================================================================
-- Comments are REACTIONS to a progress entry (<=280 chars, flat list, no
-- replies) — not a discussion channel. The fence is a product decision (see
-- Decision Log: the pivot) protecting the academic-integrity boundary and the
-- deliberately-cut open-chat scope.
--
-- Visibility follows the log: you can read/write a comment only on a log you
-- can see (your own, or a podmate's). Enforced via a SECURITY DEFINER helper —
-- the same pattern as is_podmate/is_class_member — so nothing recurses (42P17).
-- =============================================================================

create table public.progress_comments (
  id               uuid primary key default gen_random_uuid(),
  progress_log_id  uuid not null references public.progress_logs(id) on delete cascade,
  author_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 280),
  created_at       timestamptz not null default now()
);

alter table public.progress_comments enable row level security;

create index on public.progress_comments (progress_log_id, created_at);

-- Can the current user see this progress log? (owner, or podmate of the owner)
-- SECURITY DEFINER: evaluates without re-triggering RLS on progress_logs.
create or replace function public.can_see_progress_log(target_log uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from progress_logs pl
    where pl.id = target_log
      and (pl.user_id = auth.uid() or public.is_podmate(pl.user_id))
  );
$$;

create policy "read comments on visible logs"
  on public.progress_comments for select
  using ( public.can_see_progress_log(progress_log_id) );

create policy "comment on visible logs as yourself"
  on public.progress_comments for insert
  with check (
    author_id = auth.uid()
    and public.can_see_progress_log(progress_log_id)
  );

create policy "delete own comments"
  on public.progress_comments for delete
  using ( author_id = auth.uid() );