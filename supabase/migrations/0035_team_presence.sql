-- =============================================================================
-- 0035_team_presence.sql — the team table: who is online now, and the day each
-- teammate last opened the app (author's checklist of 2026-10-30, item F)
-- =============================================================================
--
-- member_presence: one row per student, written only through touch_presence()
-- (the app calls it at most once a minute while it is open) and
-- set_online_sharing(). A student reads only their own row.
--
-- team_presence(pod) gives a pod's members, to its members only:
--   last_seen_day  the Tokyo DAY of the last visit (never the time of day)
--   online         seen in the last 3 minutes AND sharing is on
-- Turning 「オンライン表示」 off in 設定 hides the live dot; the day stays.
-- Organizers and other classmates get nothing (0015). Research (0020) does not
-- use this table.
--
-- RLS on (rule 1). Test: supabase/tests/rls_team_presence.sql.
-- =============================================================================

create table public.member_presence (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at  timestamptz not null default now(),
  share_online  boolean not null default true
);
alter table public.member_presence enable row level security;

create policy "read my own presence"
  on public.member_presence for select to authenticated
  using ( user_id = auth.uid() );

revoke all on public.member_presence from public, anon, authenticated;
grant select on public.member_presence to authenticated;

-- I'm here. At most one write a minute per student.
create or replace function public.touch_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into member_presence (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = now()
    where member_presence.last_seen_at < now() - interval '1 minute';
end;
$$;

-- 設定 → オンライン表示.
create or replace function public.set_online_sharing(p_share boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_share is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into member_presence (user_id, share_online)
  values (auth.uid(), p_share)
  on conflict (user_id) do update set share_online = excluded.share_online;
end;
$$;

create or replace function public.team_presence(p_pod uuid)
returns table (user_id uuid, last_seen_day date, online boolean)
language sql
security definer
set search_path = public
stable
as $$
  select pm.user_id,
         (mp.last_seen_at at time zone 'Asia/Tokyo')::date,
         coalesce(mp.share_online and mp.last_seen_at > now() - interval '3 minutes', false)
  from pairing_members pm
  left join member_presence mp on mp.user_id = pm.user_id
  where pm.pairing_id = p_pod
    and public.is_pod_member(p_pod);
$$;

revoke execute on function public.touch_presence() from public, anon;
revoke execute on function public.set_online_sharing(boolean) from public, anon;
revoke execute on function public.team_presence(uuid) from public, anon;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.set_online_sharing(boolean) to authenticated;
grant execute on function public.team_presence(uuid) to authenticated;
