-- =============================================================================
-- rls_announcement_push.sql — tests for 0037 (push when the teacher posts)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp): O organizer of K; S1, S2 students of K;
-- X a student of another class L.
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000037e5', 'rls-test-ao@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003701', 'rls-test-as1@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000003702', 'rls-test-as2@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000037f9', 'rls-test-ax@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000037c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000037e5'),
  ('00000000-0000-4000-8000-00000037c1a6', 'RLS test class L', 'Test', 'test', '00000000-0000-4000-8000-0000000037e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000037e5', '00000000-0000-4000-8000-00000037c1a5', 'organizer'),
  ('00000000-0000-4000-8000-0000000037e5', '00000000-0000-4000-8000-00000037c1a6', 'organizer'),
  ('00000000-0000-4000-8000-000000003701', '00000000-0000-4000-8000-00000037c1a5', 'student'),
  ('00000000-0000-4000-8000-000000003702', '00000000-0000-4000-8000-00000037c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000037f9', '00000000-0000-4000-8000-00000037c1a6', 'student');

-- As O: post one announcement to K.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000037e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform set_config('rls_test.note',
    public.post_class_announcement('00000000-0000-4000-8000-00000037c1a5', '来週は中間発表です。')::text, true);
  begin
    perform 1 from public.push_events;
    raise exception 'FAIL: a client must not read push_events';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
declare
  note uuid := current_setting('rls_test.note')::uuid;
  got text;
begin
  select string_agg(right(user_id::text, 4), ',' order by user_id) into got
  from public.push_events where kind = 'announcement' and announcement_id = note;
  -- S1 and S2 (students of K); not the organizer, not X in class L.
  if got is distinct from '3701,3702' then
    raise exception 'FAIL: announcement pushes queued for %, expected 3701,3702', got;
  end if;

  begin
    insert into public.push_events (user_id, kind, ref_key)
    values ('00000000-0000-4000-8000-000000003701', 'announcement', 'x');
    raise exception 'FAIL: an announcement push without an announcement must be refused';
  exception when check_violation then null;
  end;

  -- Deleting the announcement removes its pushes (nothing to send any more).
  delete from public.class_announcements where id = note;
  if exists (select 1 from public.push_events where announcement_id = note) then
    raise exception 'FAIL: pushes should go with their announcement';
  end if;
end $$;

select 'all RLS tests passed' as result;

rollback;
