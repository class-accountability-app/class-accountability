-- DELIBERATELY BROKEN. This must make CI fail. Delete this branch afterwards.
create table public.should_fail_ci (
  id uuid primary key default gen_random_uuid()
);
-- Deliberately missing: alter table public.should_fail_ci enable row level security;
