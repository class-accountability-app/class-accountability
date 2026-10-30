# Plan: project first (Study Pods as a group-project app)

> Decided with the author on 2026-10-30. Extends `docs/plans/group-projects-plan.md` and `docs/plans/automation-plan.md` and wins where they differ. Mockup (clickable): `docs/mockups/phase4/project-first.html`. Log decisions 1–3 in Notion: they change the privacy design students were told about.

## Decisions
1. **Live numbers.** Teammates see each task's current total and when it last changed, at any time, not only in check-ins. The raw `task_progress` rows (amounts plus the ≤280-character memo) stay readable only by the logger and the task's owner. Document text stays the owner's alone (0019).
2. **Teachers get a team summary.** One row per team: member count, project started or not, % done, on track / behind, days since last activity, check-ins shared this round. No student names, no per-person numbers, no task text. Small teams are shown too, and students are told clearly ("先生には、チーム全体の進み具合だけが見えます").
3. **One project at a time.** A team can finish a project (it becomes read-only history) and start the next.
4. **The name stays Study Pods.** Inside the UI a pod is called チーム / team (default chosen for the prototype; confirm).

## Flow after login
`/welcome` (name) → join class → **start or join a team** (invitation, team code or QR) → **create the project** (title, deadline, template, check-in cadence, group Google Doc) → **the board, which is Home**. `/start/target` goes away. With exactly one active project, Home shows its board (like `classesHref` with one class).

`nextStep()` on the board, first that applies: join a class → answer an invitation → start or join a team → create the project → tasks without an owner (担当する) → characters task not linked → check-in due → poll open and not answered → log progress.

## Data (next migration, 0027)
- `project_task_totals(project)`: `security definer`, any project member; returns `task_id`, total, last changed. No memos. Replaces check-in snapshots as the source of teammates' numbers in `lib/project-board.ts`.
- `projects.status` (`active` / `done`), `finished_at`; drop `unique (pairing_id)`, add a unique index on `pairing_id where status = 'active'`. Done projects are read-only (trigger or policy).
- `class_team_summary(class)`: `security definer`, only the class's organizer; one row per team as above, active projects only. Teams numbered in a stable order.
- Team join code: a short code per pod, `join_pod_by_code()` with the same soft cap of 6 and SP003 for organizers.
- RLS tests: a teammate reads totals but not memos or text; an outsider and an organizer read no totals; only the organizer reads the summary, and it has no user ids; a second active project is refused; a done project can't be edited.

## Check-ins
They become the note before a meeting: what I did / what's next / where I'm stuck. The snapshot is still stored as history. Cadence unchanged (default 4 days).

## PR order
1. This plan + mockup + CLAUDE.md pointer (this PR).
2. 0027 migration + RLS tests + error codes.
3. Live board (`lib/project-board.ts`) and the check-in wording.
4. New `nextStep()` (tested), Home as the project, first-run steps without `/start/target`.
5. Team code / QR join.
6. Project templates (tasks with due dates counted back from the deadline).
7. Teacher summary UI on the class page.
8. Finish and start the next project.
9. Check-in reminder push; privacy page; teardown of the old targets after the author's explicit go-ahead.
