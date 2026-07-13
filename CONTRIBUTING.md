# Contributing

Team of 2–3, 7 sprints, one week each. The process below is deliberately small: enough to keep `main` clean and the Notion board honest, not enough to become the project.

---

## The loop

1. Pick a task from the **Notion Tasks** board (This Sprint view). Assign it to yourself, move to *In Progress*.
2. Branch off `main`.
3. Commit as you go.
4. Open a PR. Paste the PR link into the Notion task's **GitHub** field.
5. Get one review from a teammate.
6. Merge. Delete the branch.
7. Fill in **Actual (hrs)** on the Notion task. This is the step everyone skips — don't.

---

## Branch naming

```
<type>/<short-description>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`

```
feat/class-join-flow
feat/pod-auto-pairing
fix/wordcount-off-by-one
chore/ci-setup
```

Keep branches short-lived. A branch open longer than a few days is a merge conflict waiting to happen — and on a 1-week sprint, it's already late.

---

## Commits

Conventional Commits. It's two extra words and it makes the git history readable in your final report.

```
feat: add pod auto-pairing on class join
fix: correct word-count delta when doc is edited twice in a day
chore: add RLS policy for progress_logs
docs: document Google OAuth scope decision
```

---

## Pull requests

- **One PR per task.** If a PR does three things, it should have been three tasks.
- Fill in the PR template (it's short).
- **One approval required** before merge. Yes, even on a 2-person team — a second pair of eyes on an RLS policy is worth more than the 5 minutes it costs.
- CI must be green.
- Squash-merge to keep `main` history clean.

### Reviewing

Reviewing isn't rubber-stamping. On this project, actually check:
- Does any new table have **RLS enabled**? (See SECURITY.md — this is our #1 risk.)
- Any secrets, keys, or tokens in the diff?
- Does it do only what the task said?

---

## `main` is protected

- No direct pushes. Ever. Including you.
- PR + 1 approval + green CI to merge.

If this feels like overkill for a small team: it takes about 90 seconds per PR and it's what stops someone force-pushing over a teammate's work at 2am during Sprint 5. It also demonstrates real engineering process in your report.

---

## Schema changes

All schema changes go in `/supabase/migrations` as SQL files, committed to the repo. **Never change the schema by clicking around in the Supabase dashboard** — if you do, the schema lives in one person's browser history and nobody else can reproduce it.

Every migration that creates a table must also `enable row level security` on it, in the same file.

---

## Issues

Code-level bugs → **GitHub Issues** (they link to commits and PRs).
Planning, features, decisions, standups → **Notion**.

Don't track the same thing in both. If it has a Notion task, it doesn't need a GitHub issue too.
