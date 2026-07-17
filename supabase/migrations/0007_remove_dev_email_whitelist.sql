-- 0007_remove_dev_email_whitelist.sql
-- Removes the dev-only single-address bypass now that real andrew.ac.jp
-- delivery is proven via the verified study-pods.org sending domain.
-- Restores strict university-domain enforcement.

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