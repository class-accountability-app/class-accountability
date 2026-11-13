-- 0046: the teacher's read-only view of a team's project (several projects at
-- once, step 3; the author's choice of 2026-11-13: "Full board, read-only").
--
-- This WIDENS what a class's organizer sees (0015, 0027, 0036), on purpose and
-- with new privacy-policy wording approved by the author on 2026-11-14:
--   * each team's projects: tasks and their owners (display names), each
--     task's live total and status, the kind of Google file linked (never the
--     file), check-ins with their notes, confirmed and open meetings, and the
--     team's pinned links.
--   * NOT: text written in Study Pods (task_documents), a progress entry's
--     own memo, 声かけ, presence, votes, meeting notes, emails.
--   * Check-ins made BEFORE private.teacher_view_since() stay hidden for good:
--     students wrote those when the policy said only teammates read them.
--
-- No policy changes: students' RLS is untouched. The organizer reads through
-- two security definer functions that check is_class_organizer() themselves,
-- so there is one place that decides what a teacher gets, and nothing here
-- can write.
--   organizer_class_teams(class)  one row per team and active project (the picker)
--   organizer_team_board(project) everything above as one JSON document, or
--                                 null for anyone who is not that class's organizer
-- Test: supabase/tests/rls_teacher_board.sql.

-- Noon JST on the day this shipped; the students' notice went up before it.
create or replace function private.teacher_view_since()
returns timestamptz
language sql
immutable
as $$ select timestamptz '2026-11-14 12:00:00+09' $$;

revoke execute on function private.teacher_view_since() from public, anon, authenticated;

create or replace function public.organizer_class_teams(p_class uuid)
returns table (
  team_no integer,
  team_name text,
  project_id uuid,
  project_title text,
  class_project_id uuid,
  deadline date
)
language sql
security definer
set search_path = public
stable
as $$
  with pods as (
    select p.id, p.name, row_number() over (order by p.created_at, p.id)::integer as team_no
    from pairings p
    where p.class_id = p_class and p.status = 'active'
      and public.is_class_organizer(p_class)
  )
  select pods.team_no, pods.name, pr.id, pr.title, pr.class_project_id, pr.deadline
  from pods
  join projects pr on pr.pairing_id = pods.id and pr.status = 'active'
  order by pods.team_no, pr.deadline nulls last, pr.created_at, pr.id;
$$;

create or replace function public.organizer_team_board(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  proj  projects;
  pod   pairings;
  since timestamptz := private.teacher_view_since();
begin
  select * into proj from projects where id = p_project;
  if proj.id is null then
    return null;
  end if;
  select * into pod from pairings where id = proj.pairing_id;
  if pod.id is null or not public.is_class_organizer(pod.class_id) then
    return null;
  end if;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', proj.id, 'title', proj.title, 'start_date', proj.start_date, 'deadline', proj.deadline,
      'checkin_every_days', proj.checkin_every_days, 'status', proj.status,
      'class_project_id', proj.class_project_id),
    'team', jsonb_build_object(
      'name', pod.name,
      'team_no', (select count(*)::integer from pairings p2
                  where p2.class_id = pod.class_id and p2.status = 'active'
                    and (p2.created_at, p2.id) <= (pod.created_at, pod.id)),
      'members', (select coalesce(jsonb_agg(pf.display_name order by pf.display_name), '[]'::jsonb)
                  from pairing_members pm join profiles pf on pf.id = pm.user_id
                  where pm.pairing_id = pod.id)),
    'tasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'title', t.title,
        'owner', (select pf.display_name from profiles pf where pf.id = t.owner_id),
        'metric', t.metric, 'unit', t.unit, 'target_amount', t.target_amount,
        'status', t.status, 'due', t.due,
        'total', case when t.metric = 'status' then null
                      else (select coalesce(sum(tp.progress_value), 0) from task_progress tp where tp.task_id = t.id) end,
        'last_logged_at', (select max(tp.logged_at) from task_progress tp where tp.task_id = t.id),
        'source_kind', (select ts.kind from task_sources ts where ts.task_id = t.id),
        'in_app', t.input_mode = 'document'
      ) order by t.position, t.created_at), '[]'::jsonb)
      from project_tasks t where t.project_id = proj.id),
    'checkins', (
      select coalesce(jsonb_agg(c.row order by c.created_at desc), '[]'::jsonb)
      from (
        select pc.created_at, jsonb_build_object(
          'name', (select pf.display_name from profiles pf where pf.id = pc.user_id),
          'round_start', pc.round_start, 'created_at', pc.created_at, 'note', pc.note,
          'tasks', (select coalesce(jsonb_agg(s - 'task_id'), '[]'::jsonb) from jsonb_array_elements(pc.snapshot) s)
        ) as row
        from project_checkins pc
        where pc.project_id = proj.id and pc.created_at >= since
        order by pc.created_at desc
        limit 40
      ) c),
    'checkins_since', since,
    'links', (
      select coalesce(jsonb_agg(jsonb_build_object('title', l.title, 'url', l.url) order by l.created_at), '[]'::jsonb)
      from project_links l where l.project_id = proj.id),
    'meetings', (
      select coalesce(jsonb_agg(m.row order by m.created_at desc), '[]'::jsonb)
      from (
        select mp.created_at, jsonb_build_object(
          'title', mp.title, 'status', mp.status, 'duration_minutes', mp.duration_minutes,
          'starts_at', (select o.starts_at from meeting_poll_options o where o.id = mp.chosen_option_id)
        ) as row
        from meeting_polls mp
        where mp.project_id = proj.id and mp.status <> 'cancelled'
        order by mp.created_at desc
        limit 10
      ) m)
  );
end;
$$;

revoke execute on function public.organizer_class_teams(uuid) from public, anon;
revoke execute on function public.organizer_team_board(uuid) from public, anon;
grant execute on function public.organizer_class_teams(uuid) to authenticated;
grant execute on function public.organizer_team_board(uuid) to authenticated;
