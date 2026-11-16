-- =============================================================================
-- 0052_poll_created_push.sql — a push when a teammate starts a meeting poll
-- (the author's ask of 2026-11-16)
-- =============================================================================
--
-- Until now a new poll reached teammates only on their board, or by 0034's
-- reminder 12 hours before its deadline. Now, after insert on meeting_polls,
-- every member of the poll's team except its maker gets one push_events row
-- (kind 'poll_created', poll_id set; ref_key is the poll's id, so each person
-- is pushed once per poll), then private.send_push_events() calls
-- send-nudge-push as for 0025's pushes. Quiet hours 23:00–07:00 JST wait for
-- the morning flush, as for every push.
--
-- The function re-checks before sending: the poll is still open and the
-- person hasn't answered any time yet. The push names who started the poll
-- (as a nudge names its sender) but never the poll's title, which may be on a
-- lock screen: 「{name}さんが打ち合わせの日程調整を始めました。都合を答えましょう」.
-- Tapping it opens the poll's page. 0034's reminder stays as it is, so someone
-- who still hasn't answered 12 hours before the deadline is reminded once more.
--
-- The trigger runs inside create_meeting_poll()'s transaction, before the
-- times are inserted; that's fine, because pg_net sends the request only after
-- the transaction commits. Any error only warns: a push must never stop a poll
-- from being made.
--
-- Deploy the send-nudge-push function that knows 'poll_created' BEFORE this
-- migration. Test: supabase/tests/rls_poll_created_push.sql.
-- =============================================================================

alter table public.push_events drop constraint push_events_kind_check;
alter table public.push_events add constraint push_events_kind_check
  check (kind in ('meeting_reminder', 'task_stalled', 'checkin_due', 'poll_vote_due', 'announcement',
                  'weekly_digest', 'team_inactive', 'task_due_soon', 'poll_created'));

alter table public.push_events drop constraint push_events_ref_check;
alter table public.push_events add constraint push_events_ref_check check (
  (kind in ('meeting_reminder', 'poll_vote_due', 'poll_created') and poll_id is not null and task_id is null and project_id is null and announcement_id is null and class_id is null)
  or (kind in ('task_stalled', 'task_due_soon') and task_id is not null and poll_id is null and project_id is null and announcement_id is null and class_id is null)
  or (kind in ('checkin_due', 'weekly_digest') and project_id is not null and poll_id is null and task_id is null and announcement_id is null and class_id is null)
  or (kind = 'announcement' and announcement_id is not null and poll_id is null and task_id is null and project_id is null and class_id is null)
  or (kind = 'team_inactive' and class_id is not null and poll_id is null and task_id is null and project_id is null and announcement_id is null)
);

create or replace function private.queue_poll_created_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_events (user_id, kind, ref_key, poll_id)
  select pm.user_id, 'poll_created', new.id::text, new.id
  from public.projects p
  join public.pairing_members pm on pm.pairing_id = p.pairing_id
  where p.id = new.project_id
    and pm.user_id is distinct from new.created_by
  on conflict (user_id, kind, ref_key) do nothing;

  perform private.send_push_events();
  return new;
exception when others then
  -- A push must never stop the poll from being made.
  raise warning 'poll push not queued (%)', sqlstate;
  return new;
end;
$$;

revoke execute on function private.queue_poll_created_push() from public, anon, authenticated;

create trigger meeting_polls_push
  after insert on public.meeting_polls
  for each row execute function private.queue_poll_created_push();
