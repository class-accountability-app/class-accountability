-- =============================================================================
-- 0051_team_realtime_presence.sql — the online dot changes at once (the
-- author's ask of 2026-11-15)
-- =============================================================================
--
-- Until now "online" came only from polling: the app pings once a minute
-- (touch_presence, 0035/0050) and the board re-reads team_presence() every
-- 20 seconds. With this migration the app ALSO joins one Supabase Realtime
-- channel per team, `team:<pod id>`, and uses Presence on it: a teammate who
-- opens the app appears within about a second, and one who closes it (or
-- hides it) disappears after a short grace period set by the app.
--
-- Nothing is stored. Realtime keeps who is connected in memory and never
-- writes Presence to realtime.messages; it only runs a query on that table
-- (and rolls it back) to decide what a client may do on a channel. These
-- policies are that decision:
--
--   join and listen  (select)  a member of that pod
--   announce myself  (insert)  a member of that pod whose 「オンライン表示」
--                              is on (member_presence.share_online; no row
--                              yet = the default, on)
--
-- Only Presence: Broadcast and anything else on a team topic is refused, so
-- the channel can't become a chat (a deliberate cut). Organizers,
-- classmates in other teams and logged-out clients get nothing. A topic that
-- isn't exactly `team:<uuid>` is refused without casting it.
--
-- Realtime checks this once when a client joins and keeps the answer for that
-- connection. So turning 「オンライン表示」 off takes effect when the app
-- rejoins; the app rejoins at once when the setting changes (and stops
-- announcing itself on its own first).
--
-- What this does NOT prevent: the Presence payload is chosen by the client,
-- so a member of a team could make a teammate look online to the rest of
-- that team. It can't reach anyone outside the team, and nothing is stored.
--
-- REQUIRED dashboard setting: Realtime → Settings → turn OFF "Allow public
-- access". Without it a client can join a PUBLIC channel with the same name
-- and these policies are not applied (every classmate can read pod ids).
-- The app uses no public channels, so turning it off breaks nothing.
--
-- Test: supabase/tests/rls_team_realtime.sql.
-- =============================================================================

create or replace function public.team_channel_allowed(p_topic text, p_extension text, p_send boolean)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- Checked before the cast, in order: CASE never casts a topic that
    -- isn't a team topic.
    when p_extension is distinct from 'presence' then false
    when p_topic is null
      or p_topic !~ '^team:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when not public.is_pod_member(substring(p_topic from 6)::uuid) then false
    when not p_send then true
    else coalesce(
      (select mp.share_online from member_presence mp where mp.user_id = auth.uid()),
      true
    )
  end;
$$;

revoke execute on function public.team_channel_allowed(text, text, boolean) from public, anon;
grant execute on function public.team_channel_allowed(text, text, boolean) to authenticated;

create policy "team members see their team's presence"
  on realtime.messages for select to authenticated
  using ( public.team_channel_allowed((select realtime.topic()), extension, false) );

create policy "team members announce their own presence"
  on realtime.messages for insert to authenticated
  with check ( public.team_channel_allowed((select realtime.topic()), extension, true) );
