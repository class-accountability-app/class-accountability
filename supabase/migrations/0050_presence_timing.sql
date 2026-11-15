-- =============================================================================
-- 0050_presence_timing.sql — the online dot goes off sooner (the author's ask
-- of 2026-11-15)
-- =============================================================================
--
-- Since 0035 a student counted as online for 3 minutes after their last ping,
-- so a teammate who closed the app still looked online for up to 3 minutes.
-- The app pings once a minute while it is open and visible, so:
--
--   team_presence()   online = seen in the last 100 seconds (was 3 minutes):
--                     one ping interval plus 40 seconds for a slow timer or
--                     network, so nobody who is here flickers to offline.
--   touch_presence()  writes at most once every 45 seconds (was 1 minute).
--                     With the old limit a ping that arrived a little early
--                     (59 s after the last write) was dropped, leaving a
--                     2-minute gap; with a 100-second window that would have
--                     shown an open app as offline. The app still pings once
--                     a minute, so the row is still written about once a
--                     minute, as the privacy policy says.
--
-- Nothing else changes: the same columns, the same callers (pod members
-- only), the same grants, last_seen_day is still a Tokyo DAY, and the
-- 「オンライン表示」 switch still hides the dot. No table, policy or grant is
-- touched (create or replace keeps the grants of 0035).
--
-- Test: supabase/tests/rls_team_presence.sql.
-- =============================================================================

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
    where member_presence.last_seen_at < now() - interval '45 seconds';
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
         coalesce(mp.share_online and mp.last_seen_at > now() - interval '100 seconds', false)
  from pairing_members pm
  left join member_presence mp on mp.user_id = pm.user_id
  where pm.pairing_id = p_pod
    and public.is_pod_member(p_pod);
$$;
