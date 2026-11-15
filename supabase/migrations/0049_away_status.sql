-- 0049: お休み (away status, the author's choice of 2026-11-13).
--
-- A student can tell their team "I'm away until <day>" (at most 30 days
-- ahead). It is one date, with no reason and no text.
--   member_presence.away_until  null = not away; the last Tokyo day of the break
--   set_away(until)             my own row only; null clears it; a past day or
--                               one more than 30 days ahead is refused (23514)
--   team_away(pod)              to the pod's members only: who is away today
--                               and until when. A break that has ended is not
--                               returned (nothing has to clear it).
-- The team sees it on チームのようす. Organizers, other classmates and research
-- get nothing, as with the rest of 0035. It changes no reminders.
-- (0048, the due-tomorrow push, is a separate migration.)
-- Test: supabase/tests/rls_team_away.sql.

alter table public.member_presence add column away_until date;

create or replace function public.set_away(p_until date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_until is not null and (p_until < today or p_until > today + 30) then
    raise exception 'away until must be today or within 30 days' using errcode = '23514';
  end if;
  insert into member_presence (user_id, away_until)
  values (auth.uid(), p_until)
  on conflict (user_id) do update set away_until = excluded.away_until;
end;
$$;

create or replace function public.team_away(p_pod uuid)
returns table (user_id uuid, away_until date)
language sql
security definer
set search_path = public
stable
as $$
  select pm.user_id, mp.away_until
  from pairing_members pm
  join member_presence mp on mp.user_id = pm.user_id
  where pm.pairing_id = p_pod
    and public.is_pod_member(p_pod)
    and mp.away_until >= (now() at time zone 'Asia/Tokyo')::date;
$$;

revoke execute on function public.set_away(date) from public, anon;
revoke execute on function public.team_away(uuid) from public, anon;
grant execute on function public.set_away(date) to authenticated;
grant execute on function public.team_away(uuid) to authenticated;
