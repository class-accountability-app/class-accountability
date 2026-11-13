-- =============================================================================
-- rls_team_links.sql — tests for 0043 (チームのリンク)
-- =============================================================================
-- ONE transaction that ends in ROLLBACK, like the other files here.
-- Success is the final row: result = 'all RLS tests passed'.
--
-- Cast (all @andrew.ac.jp):
--   A, B — class K, pod F1, project P1
--   C    — class K, pod F2, project P2 (a classmate, not a teammate)
--   O    — organizer of K
-- =============================================================================

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000043a1', 'rls-test-tla@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000043b2', 'rls-test-tlb@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000043c3', 'rls-test-tlc@andrew.ac.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000043e5', 'rls-test-tlo@andrew.ac.jp', 'authenticated', 'authenticated');

insert into public.classes (id, name, university, term, created_by) values
  ('00000000-0000-4000-8000-00000043c1a5', 'RLS test class K', 'Test', 'test', '00000000-0000-4000-8000-0000000043e5');

insert into public.class_memberships (user_id, class_id, role) values
  ('00000000-0000-4000-8000-0000000043a1', '00000000-0000-4000-8000-00000043c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000043b2', '00000000-0000-4000-8000-00000043c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000043c3', '00000000-0000-4000-8000-00000043c1a5', 'student'),
  ('00000000-0000-4000-8000-0000000043e5', '00000000-0000-4000-8000-00000043c1a5', 'organizer');

insert into public.pairings (id, class_id) values
  ('00000000-0000-4000-8000-0000000043f1', '00000000-0000-4000-8000-00000043c1a5'),
  ('00000000-0000-4000-8000-0000000043f2', '00000000-0000-4000-8000-00000043c1a5');

insert into public.pairing_members (pairing_id, user_id) values
  ('00000000-0000-4000-8000-0000000043f1', '00000000-0000-4000-8000-0000000043a1'),
  ('00000000-0000-4000-8000-0000000043f1', '00000000-0000-4000-8000-0000000043b2'),
  ('00000000-0000-4000-8000-0000000043f2', '00000000-0000-4000-8000-0000000043c3');

insert into public.projects (id, pairing_id, title) values
  ('00000000-0000-4000-8000-00000043a0b1', '00000000-0000-4000-8000-0000000043f1', 'P1'),
  ('00000000-0000-4000-8000-00000043a0b2', '00000000-0000-4000-8000-0000000043f2', 'P2');

-- =============================================================================
-- As A: adds links; bad addresses, bad titles, a forged adder and an 11th link
-- are refused
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000043a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  bad text;
begin
  insert into public.project_links (project_id, title, url)
  values ('00000000-0000-4000-8000-00000043a0b1', '課題の説明', 'https://example.com/brief');
  if (select added_by from public.project_links) is distinct from '00000000-0000-4000-8000-0000000043a1'::uuid then
    raise exception 'FAIL: the database should stamp who added the link';
  end if;

  foreach bad in array array[
    'http://example.com/plain',
    'javascript:alert(1)',
    'https://example.com/a b',
    'https://',
    ' https://example.com',
    'data:text/html,hi'
  ] loop
    begin
      insert into public.project_links (project_id, title, url)
      values ('00000000-0000-4000-8000-00000043a0b1', 'x', bad);
      raise exception 'FAIL: this address must be refused: %', bad;
    exception when check_violation then null;
    end;
  end loop;

  begin
    insert into public.project_links (project_id, title, url)
    values ('00000000-0000-4000-8000-00000043a0b1', '   ', 'https://example.com/x');
    raise exception 'FAIL: an empty title must be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_links (project_id, title, url)
    values ('00000000-0000-4000-8000-00000043a0b1', repeat('あ', 61), 'https://example.com/x');
    raise exception 'FAIL: a 61-character title must be refused';
  exception when check_violation then null;
  end;

  -- Clients can't say who added a link, or when.
  begin
    insert into public.project_links (project_id, title, url, added_by)
    values ('00000000-0000-4000-8000-00000043a0b1', 'x', 'https://example.com/x', '00000000-0000-4000-8000-0000000043b2');
    raise exception 'FAIL: a client must not set added_by';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.project_links set title = 'changed';
    raise exception 'FAIL: links are not edited, only added and removed';
  exception when insufficient_privilege then null;
  end;

  -- A link into another team's project is refused.
  begin
    insert into public.project_links (project_id, title, url)
    values ('00000000-0000-4000-8000-00000043a0b2', 'x', 'https://example.com/x');
    raise exception 'FAIL: A must not add a link to another team''s project';
  exception when insufficient_privilege then null;
  end;

  -- 9 more make 10; the 11th is SP019.
  insert into public.project_links (project_id, title, url)
  select '00000000-0000-4000-8000-00000043a0b1', 'L' || n, 'https://example.com/' || n
  from generate_series(2, 10) n;
  begin
    insert into public.project_links (project_id, title, url)
    values ('00000000-0000-4000-8000-00000043a0b1', 'L11', 'https://example.com/11');
    raise exception 'FAIL: an 11th link must be refused';
  exception when sqlstate 'SP019' then null;
  end;
end $$;
reset role;

-- =============================================================================
-- As B (teammate): reads all 10, removes one a teammate added
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000043b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n integer;
begin
  if (select count(*) from public.project_links) <> 10 then
    raise exception 'FAIL: B should read the team''s 10 links';
  end if;
  delete from public.project_links where title = 'L10';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: B should be able to remove a teammate''s link';
  end if;
end $$;
reset role;

-- =============================================================================
-- As C (classmate in another team) and O (organizer): nothing
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000043c3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n integer;
begin
  if (select count(*) from public.project_links) <> 0 then
    raise exception 'FAIL: C must not read another team''s links';
  end if;
  delete from public.project_links;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: C must not remove another team''s links';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000043e5","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.project_links) <> 0 then
    raise exception 'FAIL: the organizer must not read a team''s links';
  end if;
  begin
    insert into public.project_links (project_id, title, url)
    values ('00000000-0000-4000-8000-00000043a0b1', 'x', 'https://example.com/x');
    raise exception 'FAIL: the organizer must not add links';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- =============================================================================
-- Finished project: links stay readable, nothing changes
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000043a1","role":"authenticated"}', true);
set local role authenticated;
select public.finish_project('00000000-0000-4000-8000-00000043a0b1');
do $$
declare
  n integer;
begin
  if (select count(*) from public.project_links) <> 9 then
    raise exception 'FAIL: a finished project''s links should stay readable';
  end if;
  begin
    insert into public.project_links (project_id, title, url)
    values ('00000000-0000-4000-8000-00000043a0b1', 'late', 'https://example.com/late');
    raise exception 'FAIL: a finished project must not get new links';
  exception when sqlstate 'SP016' then null;
  end;
  delete from public.project_links;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: a finished project''s links must not be removed';
  end if;
end $$;
reset role;

-- =============================================================================
-- Logged out: nothing
-- =============================================================================
set local role anon;
do $$
begin
  begin
    perform 1 from public.project_links;
    raise exception 'FAIL: anon must not read project_links';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'all RLS tests passed' as result;

rollback;
