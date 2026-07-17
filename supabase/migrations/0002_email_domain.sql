-- =============================================================================
-- 0002_email_domain.sql — Enforce university email domain at signup
-- =============================================================================
-- The client-side check in the login form is a UX affordance, not a security
-- control: the anon key is public, so anyone can call signInWithOtp directly.
-- This trigger is the actual enforcement — it runs inside the signup
-- transaction; raising here rolls the whole thing back, so no orphaned
-- auth.users row survives a rejected signup.
--
-- LIMITATION (accepted for MVP, state in the report): this proves the user
-- controls an andrew.ac.jp address. It does NOT prove they are enrolled in the
-- class they join. Enrollment stays trust-based, per the PRD.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domain text := 'andrew.ac.jp';
begin
  if lower(split_part(new.email, '@', 2)) <> allowed_domain then
    raise exception 'Signup is limited to % email addresses.', allowed_domain
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;
