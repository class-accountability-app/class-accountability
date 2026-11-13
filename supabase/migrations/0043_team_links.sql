-- =============================================================================
-- 0043_team_links.sql — チームのリンク (the author's ask of 2026-11-13)
-- =============================================================================
-- Since 2026-11-08 every task has its own file, made by its owner, so the team
-- has no one place for what it shares: the assignment brief, the final deck, a
-- shared Drive folder. project_links is that place: a title and an https link,
-- pinned on the board. Links only: no text, no numbers.
--
-- Who: the project's team reads, adds and removes (any member, like tasks).
-- Nobody else: not classmates, not the class's organizer, not logged-out
-- requests. A finished project's links stay readable and can't change (0033).
--
-- Limits: 10 links per project (SP019); a title of 1–60 characters; an https
-- URL of at most 500 characters with no spaces or control characters, so a
-- "javascript:" or "http://" address can never be stored.
-- =============================================================================

create table public.project_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  url         text not null,
  added_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint project_links_title check (char_length(btrim(title)) between 1 and 60 and title !~ '[[:cntrl:]]'),
  constraint project_links_url check (char_length(url) <= 500 and url ~ '^https://[^[:space:][:cntrl:]]+$')
);
alter table public.project_links enable row level security;
create index project_links_project_idx on public.project_links (project_id, created_at);

create policy "team reads its links"
  on public.project_links for select to authenticated
  using ( public.is_project_member(project_id) );
create policy "team adds links"
  on public.project_links for insert to authenticated
  with check ( public.is_project_member(project_id) and added_by = (select auth.uid()) );
-- Removing is refused on a finished project here, since a delete trigger has
-- no new row for guard_finished_project to read.
create policy "team removes links"
  on public.project_links for delete to authenticated
  using (
    public.is_project_member(project_id)
    and exists (select 1 from public.projects p where p.id = project_id and p.status = 'active')
  );

-- At most 10 per project. Locks the project row so two adds at once can't
-- both see 9.
create or replace function public.check_project_link_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from projects where id = new.project_id for update;
  if (select count(*) from project_links where project_id = new.project_id) >= 10 then
    raise exception 'a project has at most 10 links' using errcode = 'SP019';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_project_link_limit() from public, anon, authenticated;

create trigger project_links_limit
  before insert on public.project_links
  for each row execute function public.check_project_link_limit();
-- Finished projects are read-only (0033): the same guard as tasks.
create trigger project_links_guard_finished
  before insert on public.project_links
  for each row execute function public.guard_finished_project();

-- Clients choose the project, title and URL; the database fills in the rest.
revoke all on public.project_links from public, anon, authenticated;
grant select, delete on public.project_links to authenticated;
grant insert (project_id, title, url) on public.project_links to authenticated;
