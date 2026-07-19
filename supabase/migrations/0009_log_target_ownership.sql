-- =============================================================================
-- 0009_log_target_ownership.sql — A progress log's author must own its target
-- =============================================================================
-- Gap found in Sprint 3 review: the progress_logs insert policy checks the
-- LOG's user_id = auth.uid(), but nothing binds it to the TARGET's owner —
-- so a user could log progress (as themselves) against a podmate's target,
-- silently inflating that podmate's totals. RLS cannot express "column A must
-- match a column on the row B references"; a composite FK can.

alter table public.targets
  add constraint targets_id_user_unique unique (id, user_id);

alter table public.progress_logs
  add constraint progress_logs_target_owner_fk
  foreign key (target_id, user_id) references public.targets (id, user_id);
  