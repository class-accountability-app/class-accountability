-- =============================================================================
-- 0037_announcement_push.sql — a push when the teacher posts an announcement
-- (follow-up to 0036, the author's "next steps" item 4)
-- =============================================================================
--
-- After insert on class_announcements, every student of the class gets one
-- push_events row (kind 'announcement', announcement_id set; ref_key is the
-- announcement's id, so each student is pushed once per announcement), then
-- private.send_push_events() calls send-nudge-push as for 0025's pushes
-- (quiet hours 23:00–07:00 JST wait for the morning flush).
-- The push text never includes the announcement itself (lock screens are
-- visible to others): 「先生からお知らせが届きました」. Tapping it opens the
-- student's project board, where the announcement is shown.
--
-- Needs 0036. Deploy the send-nudge-push function that knows 'announcement'
-- BEFORE this migration. Test: supabase/tests/rls_announcement_push.sql.
-- =============================================================================

alter table public.push_events
  add column announcement_id uuid references public.class_announcements(id) on delete cascade;

alter table public.push_events drop constraint push_events_kind_check;
alter table public.push_events add constraint push_events_kind_check
  check (kind in ('meeting_reminder', 'task_stalled', 'checkin_due', 'poll_vote_due', 'announcement'));

alter table public.push_events drop constraint push_events_ref_check;
alter table public.push_events add constraint push_events_ref_check check (
  (kind in ('meeting_reminder', 'poll_vote_due') and poll_id is not null and task_id is null and project_id is null and announcement_id is null)
  or (kind = 'task_stalled' and task_id is not null and poll_id is null and project_id is null and announcement_id is null)
  or (kind = 'checkin_due' and project_id is not null and poll_id is null and task_id is null and announcement_id is null)
  or (kind = 'announcement' and announcement_id is not null and poll_id is null and task_id is null and project_id is null)
);

create or replace function private.queue_announcement_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_events (user_id, kind, ref_key, announcement_id)
  select cm.user_id, 'announcement', new.id::text, new.id
  from public.class_memberships cm
  where cm.class_id = new.class_id and cm.role = 'student'
  on conflict (user_id, kind, ref_key) do nothing;

  perform private.send_push_events();
  return new;
exception when others then
  -- A push must never stop the announcement from being posted.
  raise warning 'announcement push not queued (%)', sqlstate;
  return new;
end;
$$;

revoke execute on function private.queue_announcement_push() from public, anon, authenticated;

create trigger class_announcements_push
  after insert on public.class_announcements
  for each row execute function private.queue_announcement_push();
