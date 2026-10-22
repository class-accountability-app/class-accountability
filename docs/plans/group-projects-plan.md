# Plan: pivot Study Pods from individual targets to group projects

## Context
The app today gives each student their own targets and progress logs; podmates passively see them. The author wants it to be a **group-project tool**: a pod works on one shared project (e.g. a presentation), split into tasks with owners, and everyone can see where each member is. Different tasks are measured differently (script = character/word count, slides = number done, others = status). Teammates do **not** see everything: instead the group has a **timed check-in** (e.g. every 4 days) where each member shares a progress snapshot. Google Docs and other integrations come later, but the model must be ready for them.

Decisions made with the author:
- **Replace** targets with project tasks (not alongside).
- **Any pod member** can create the project and add/assign/edit tasks.
- **Integrations: design now, build later** (a `source` field; no OAuth in this plan).
- **Document text stays owner-only** (0019 rule kept). Teammates see counts and check-in snapshots, never text.
- **Existing pilot data is deleted** (targets, logs, comments, documents). Author confirmed. Run only after one more explicit go-ahead at execution time; counts only, never read real students' content (see memory: real-accounts-off-limits).

## Data model (new migration `0022_group_projects.sql`, then `0023` for the teardown)
Pod = `pairings` (reuse; cap 6 and the pod-formation flow are unchanged).

- `projects`: `id`, `pairing_id` (FK pairings, cascade), `class_id`, `title` (1-120), `deadline date`, `checkin_every_days int` (default 4, check 1-14), `created_by`, `created_at`. One active project per pod to start (unique on `pairing_id`).
- `project_tasks`: `id`, `project_id` (cascade), `title`, `owner_id` (FK profiles, `on delete set null`), `metric` in (`status`, `count`, `characters`) plus `unit` text (e.g. "slides"), `target_amount numeric` (null or > 0), `status` in (`todo`,`doing`,`done`), `input_mode` (`manual`,`document`), `source` in (`manual`,`document`,`google_docs`) (future-ready), `due date`, `position`, `created_at`.
- `task_progress` (replaces `progress_logs` for tasks): `id`, `task_id`, `user_id`, `progress_value`, `note` (<=280), `source`, `client_id` (unique per user for idempotency), `logged_at` server-set. Totals always summed on read (as 0014).
- `task_documents` / `task_document_versions`: the 0019 tables re-keyed on `task_id`, same owner-only RLS, `save_document` / `keep_document_version` reworked to take a task id. Sessions still log the character difference into `task_progress`.
- `project_checkins`: one row per member per check-in round: `id`, `project_id`, `user_id`, `round_start date` (derived from deadline/start and `checkin_every_days`, Tokyo days), `summary text` (<=280), `snapshot jsonb` (server-built from that member's tasks: title, metric, current, target, status; counts only). Unique `(project_id, user_id, round_start)`. Written only through RPC `submit_checkin(project, note)` so the snapshot is computed in the DB, never trusted from the client.
- Comments: `task_comments` (or re-point `progress_comments` at check-ins); decide at implementation, default to comments on check-ins only.

### RLS and security (rule 1 and 3)
- RLS enabled on every new table in the same file.
- New helpers following the existing pattern (`security definer`, `set search_path = public`, `stable`): `is_project_member(project)` (via `pairing_members`, reusing `is_pod_member`), `can_see_task(task)`.
- **Visibility rule (the core design point):** tasks (title, owner, metric, status, target) are visible to all pod members. A member's **raw progress entries and notes** are visible to the owner only; teammates see the **task status and the latest check-in snapshot**. Check-in rows are visible to the pod. This implements "not everything, but a timed share". Confirm before implementation whether teammates should also see the running total between check-ins (default: no, only at check-in; owner sees live).
- Organizers cannot be in pods (SP003) so they never touch projects; keep `enforce_pod_member_is_student` semantics.
- Writes via RLS for tasks (any pod member); progress/documents/check-ins via owner-only policies or RPCs. Revoke grants as in 0019 L92-95.
- New SQLSTATEs from `SP008`: project cap per pod, check-in already submitted, task not yours. Add to `DB_CODES` in `lib/errors.ts`.
- `leave_pod`: tasks owned by the leaver become unassigned (`set null`); the project goes when the pod empties (cascade). `delete_my_account` needs no change beyond cascades, but its RLS test must be extended.
- Update `0020/0021` research functions (they reference `targets`/`progress_logs`) to the new tables, counts only, same suppression rules; extend `rls_research_metrics.sql`.

### Teardown migration `0023_drop_individual_targets.sql` (destructive, last)
Drop `targets`, `progress_logs`, `progress_comments`, `documents`, `document_versions` and their triggers/functions (`save_document` old signature, SP006/SP007 triggers, `can_see_target`, `can_see_progress_log`). Only after the new UI ships and the author gives the go-ahead. Before and after: `select count(*)` on `auth.users`, `profiles`, `nudges` must match (CLAUDE.md RLS test routine).

## App changes
Reuse as-is: pod/invite actions (`app/classes/[classId]/actions.ts`), `lib/date.ts`, `lib/errors.ts` (`toErrorKey`), nudges and push, the editor stack (`lib/doc-schema.ts`, `lib/char-count.ts`, `lib/autosave.ts`, `lib/local-draft.ts`, `lib/docx-export.ts`, `components/doc-view.tsx`), `messages.test.ts`.

New / rewritten:
- `lib/tasks.ts` (metric types, validation), `lib/project-stats.ts` (pure, tested: task % done, project % done, days left, who is behind, check-in round math in Tokyo days via `tokyoWeekStart`-style helpers in `lib/date.ts`), `lib/checkin.ts` (pure round calculation, tested).
- Replace `lib/next-step.ts` logic with project-shaped steps (join class, join/start pod, create project, claim a task, log progress, submit check-in); keep it pure and tested.
- Routes: `app/classes/[classId]/project/` (team board: tasks grouped by member, status, counts), `.../project/tasks/new`, `.../project/checkin`; editor route moves to `.../project/tasks/[taskId]/write` (+ `/print`).
- Server actions: `createProject`, `addTask`, `updateTask`, `assignTask`, `logTaskProgress` (keeps `client_id` idempotency), `setTaskStatus`, `submitCheckin`.
- Home (`app/page.tsx`): "my tasks" + project progress + "check-in due in N days"; replaces the target hero and `components/quick-log/*` (adapt, don't rewrite: the sheet, chips and toast carry over).
- Remove: `lib/targets.ts`, `lib/target-presets.ts`, `lib/target-templates.ts`, old `targets/new`, `components/target-form/*`, `home-targets`, `projection` (or port), first-run steps that create a target.
- Check-in reminder: reuse nudges/push plumbing (one push per round, quiet hours respected); optional second step.
- Messages: new namespaces (`project`, `task`, `checkin`) in **both** `ja.json` (polite です・ます) and `en.json`; retire dead target keys. Forms follow rule 10 (16px, visible labels, correct keyboard).
- Docs: update `CLAUDE.md` (what the project is, data model, scope, rules 3 and 11), `app/privacy/page.tsx` (check-in sharing wording), and add a mockup in `docs/mockups/phase4/` first, since rule 11 says mockups are the design source. Flag the pivot so the author logs it as a decision in Notion.
- Future-ready: `task_projects.source` and a `lib/progress-sources.ts` interface (`fetchProgress(task)`), no implementation; Google Docs stays Phase 3 and is built fresh, never by merging `spike/google-docs-poc`.

## Suggested PR order (branch per PR, never `main`)
1. Mockup + CLAUDE.md update (design source, scope; no code).
2. `0022` migration + `supabase/tests/rls_group_projects.sql` (cast: member, other-pod student, organizer, logged out) + error codes.
3. Pure libs with Vitest tests (`project-stats`, `checkin`, `next-step`).
4. Project board, tasks, logging UI + messages (ja/en).
5. Editor re-keyed to tasks.
6. Check-in submit + push reminder.
7. Research metrics update, then `0023` teardown after explicit go-ahead.

## Verification
- Local: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` before every push (CI runs all four).
- DB: run each new RLS test file on the live project via Supabase MCP `execute_sql` (ask first); expect final row `all RLS tests passed`; counts of `auth.users`, `profiles`, `nudges` equal before and after. Tests must prove: a member sees tasks and check-ins but not a teammate's raw progress or document text; outsiders and organizers see nothing; the client cannot forge a snapshot; a second check-in in a round is refused.
- Manual (Chrome, test accounts only, no session capture): create pod of 3, create project, assign tasks of each metric, log progress, submit check-ins, confirm teammate views, phone width, ja and en.
- Real accounts stay off-limits; counts only.

## Open items to confirm during implementation
- Whether teammates see live running totals between check-ins (default: no).
- Exact check-in cadence UI (default every 4 days, editable per project, 1-14).
- One project per pod vs several (default one).
