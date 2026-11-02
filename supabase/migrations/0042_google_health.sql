-- =============================================================================
-- 0042_google_health.sql — the organizer sees when Google counting is broken
-- (the author's ask of 2026-11-02, before the pilot)
-- =============================================================================
--
-- class_google_health(class): for the class's own organizer only, three counts
-- over the Google links of the class's active projects that are still being
-- counted (no deadline, or a deadline not yet past: 0026's sync skips the rest):
--   links    — how many tasks are linked to a Google file
--   lost     — links Google refused (file deleted, access lost, Google
--              disconnected: task_sources.state = 'lost_access')
--   stuck    — links made more than a day ago that haven't been counted for a
--              day (the sync itself is failing: a secret, the API, pg_cron)
-- Counts only: no team, task, student or file. A student already sees their
-- own task's state on the board; this tells the organizer something needs a
-- look before the numbers quietly stop. Anyone else gets no row.
-- Test: supabase/tests/rls_google_health.sql.
-- =============================================================================

create or replace function public.class_google_health(p_class uuid)
returns table (links integer, lost integer, stuck integer)
language sql
security definer
set search_path = public
stable
as $$
  with live as (
    select s.state, s.linked_at, y.last_checked_at
    from task_sources s
    join project_tasks t on t.id = s.task_id
    join projects pr on pr.id = t.project_id and pr.status = 'active'
    join pairings p on p.id = pr.pairing_id and p.status = 'active'
    left join private.task_source_sync y on y.task_id = s.task_id
    where p.class_id = p_class
      and (pr.deadline is null or pr.deadline >= (now() at time zone 'Asia/Tokyo')::date)
  )
  select count(*)::integer,
         count(*) filter (where state = 'lost_access')::integer,
         count(*) filter (where state = 'ok'
                            and linked_at < now() - interval '24 hours'
                            and (last_checked_at is null or last_checked_at < now() - interval '24 hours'))::integer
  from live
  -- An aggregate always gives a row; HAVING gives anyone else none at all.
  having public.is_class_organizer(p_class);
$$;

revoke execute on function public.class_google_health(uuid) from public, anon;
grant execute on function public.class_google_health(uuid) to authenticated;
