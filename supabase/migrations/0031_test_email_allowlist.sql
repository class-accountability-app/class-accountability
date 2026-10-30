-- 0031: named test accounts outside andrew.ac.jp (author's request, 2026-10-30).
--
-- Signup stays limited to andrew.ac.jp in the database (rule 4). The one
-- exception is an address listed in private.allowed_test_emails, which only
-- the project owner fills, by SQL in the dashboard; no address is ever
-- written in this repository. 0007 removed an earlier single-address bypass;
-- this brings back the same idea as a table instead of a hard-coded address.
--
-- An account created through the list is a test account, so it is added to
-- private.research_excluded_users (0020) with reason 'test' and never counted
-- in the research figures.
--
-- Add or remove an address (SQL editor, as the project owner):
--   insert into private.allowed_test_emails (email) values ('someone@example.com');
--   delete from private.allowed_test_emails where email = 'someone@example.com';
-- Removing an address doesn't delete an account already made with it.

create table private.allowed_test_emails (
  email     text primary key,
  added_at  timestamptz not null default now(),
  constraint allowed_test_emails_lower check (email = lower(btrim(email)) and email like '%@%')
);

alter table private.allowed_test_emails enable row level security;
revoke all on private.allowed_test_emails from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domain text := 'andrew.ac.jp';
  is_test boolean := exists (select 1 from private.allowed_test_emails t where t.email = lower(new.email));
begin
  if lower(split_part(new.email, '@', 2)) <> allowed_domain and not is_test then
    raise exception 'Signup is limited to % email addresses.', allowed_domain
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(split_part(new.email, '@', 1), 20));

  if is_test then
    insert into private.research_excluded_users (user_id, reason)
    values (new.id, 'test')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
