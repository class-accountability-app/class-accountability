# CLAUDE.md

Context for Claude Code. Read this before doing anything in this repo.

## What this project is

A class-scoped accountability app for university students. Students in the same class are auto-paired into **pods of 3** and can passively see each other's progress. No chat, no coordination — quiet mutual accountability. Solo-built capstone project, 7-week timeline (14 Jul – 28 Aug 2026).

The core loop: sign up → join a class → get auto-paired into a pod → set a target → log progress → see podmates' progress → optional nudge.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind**
- **Supabase**: Postgres + Auth (magic link) + **Row Level Security**
- Hosted on **Vercel**; CI via **GitHub Actions**
- Node 20+. Windows dev machine (PowerShell).
- The root request-interception file is **`proxy.ts`** (Next 16's convention), not `middleware.ts` — the old convention is deprecated and triggers a build warning. Don't recreate `middleware.ts` at the root.

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
- `npm run build` — production build
- Run lint + typecheck + build locally before every push; CI runs all three.

## Non-negotiable rules

1. **Every Postgres table has RLS enabled.** A table without `enable row level security` is publicly readable via the anon key (which ships to the browser). Every migration that runs `create table` must also enable RLS in the same file. CI fails the PR otherwise.
2. **The `service_role` key is server-side only.** Never in client code, never in a `NEXT_PUBLIC_` var, never committed. The anon key is public by design and fine to use client-side — RLS is what protects data.
3. **Authorization lives in the database, not the app.** The privacy rule (you see a person's data only if you're podmates) is enforced by RLS policies and the `is_podmate()` helper, not by frontend checks. Frontend checks are UX, not security.
4. **The university-email restriction is enforced in a DB trigger**, not just the login form — the anon key lets anyone bypass the form.
5. **Schema changes go in `supabase/migrations/*.sql`**, committed to the repo — never by clicking in the Supabase dashboard. Note the folder is spelled `migrations` (this bit us once).
6. **`main` is protected.** Work on a branch, open a PR, let CI pass, merge. Never commit to `main` directly.
7. **Never use `getSession()` in `proxy.ts` for auth decisions — use `getUser()`**, which revalidates the token. `getSession()` trusts the cookie without verifying it.

## Data model (already migrated in 0001_init.sql)

`profiles`, `classes`, `class_memberships`, `pairings`, `pairing_members`, `targets`, `progress_logs`, `nudges`. Pods are the `pairing_members` join table (NOT an array column — you can't write clean RLS against an array). `is_podmate(uuid)` is a `security definer` helper that every visibility policy calls.

## Scope discipline

**In (MVP):** auth, create/join class, auto-pairing into pods of 3, targets + deadlines, manual progress logging, shared pod view, one "stuck on" nudge, churn detection (display-only).

**Cut / out of scope — do NOT build these without being asked:** Google Docs auto-tracking (cut for solo timeline), peer report feedback, cross-university stranger matching, open chat, gamification. These are deliberate cuts, logged as decisions. Don't "helpfully" add them.

## Working style

- This is a learning project the author must be able to defend. Explain what you're doing and why; don't just emit code.
- Ask before writing files or running commands that change things. Prefer showing a plan first for anything touching more than ~2 files.
- Keep UI minimal — visual polish is deferred to the final sprint. Don't spend effort on aesthetics now.
- Decisions of record live in Notion, not here. If a real architectural choice comes up, flag it so the author can log it.
