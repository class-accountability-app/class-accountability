# CLAUDE.md

Context for Claude Code. Read this before doing anything in this repo.

## What this project is

A class-scoped accountability app for university students. Students in the same class form small **pods of up to 6** and can passively see each other's progress. No chat, no coordination — quiet mutual accountability. Solo-built capstone project, 7-week timeline (14 Jul – 28 Aug 2026).

Pods are formed by the students themselves, not auto-paired: anyone in a class can start a pod, invite classmates, or ask to join an existing pod; the invitee or the pod accepts or declines. The cap of 6 is a soft cap checked in the server action, not a DB constraint (see 0003/0004).

The core loop: sign up → join a class → start or join a pod → set a target → log progress → see podmates' progress → optional nudge.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind**
- **Supabase**: Postgres + Auth (magic link) + **Row Level Security**
- **next-intl** for Japanese/English, with no locale in the URL. Locale comes from the `locale` cookie, then `Accept-Language` (ja → Japanese, anything else → English), then Japanese (`i18n/`).
- Hosted on **Vercel**; CI via **GitHub Actions**
- Node 24 everywhere: local, CI and Vercel (`engines` in package.json). The lock file is written by a newer npm than Node 20's npm 10, which rejects it in `npm ci`. Windows dev machine (PowerShell).
- The root request-interception file is **`proxy.ts`** (Next 16's convention), not `middleware.ts` — the old convention is deprecated and triggers a build warning. Don't recreate `middleware.ts` at the root.

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
- `npm test` — unit tests (Vitest)
- `npm run build` — production build
- Run lint + typecheck + test + build locally before every push; CI runs all four.

## Non-negotiable rules

1. **Every Postgres table has RLS enabled.** A table without `enable row level security` is publicly readable via the anon key (which ships to the browser). Every migration that runs `create table` must also enable RLS in the same file. CI fails the PR otherwise.
2. **The `service_role` key is server-side only.** Never in client code, never in a `NEXT_PUBLIC_` var, never committed. The anon key is public by design and fine to use client-side — RLS is what protects data.
3. **Authorization lives in the database, not the app.** The privacy rule (you see a person's data only if you're podmates) is enforced by RLS policies and the `is_podmate()` helper, not by frontend checks. Frontend checks are UX, not security.
4. **The university-email restriction is enforced in a DB trigger**, not just the login form — the anon key lets anyone bypass the form.
5. **Schema changes go in `supabase/migrations/*.sql`**, committed to the repo — never by clicking in the Supabase dashboard. Note the folder is spelled `migrations` (this bit us once).
6. **`main` is protected.** Work on a branch, open a PR, let CI pass, merge. Never commit to `main` directly.
7. **Never use `getSession()` in `proxy.ts` for auth decisions — use `getUser()`**, which revalidates the token. `getSession()` trusts the cookie without verifying it.
8. **No hard-coded UI strings.** Every user-facing string lives in `messages/ja.json` and `messages/en.json` — add every new key to both (`npm test` fails if the files drift). Japanese is the default and uses polite です・ます form. Server actions return an error key from `lib/errors.ts`, never a raw Supabase/Postgres message; unexpected errors go through `toErrorKey()`, which logs code + message server-side (no emails or other user data). Login is the exception: `signInWithOtp` stays in the browser so Supabase's per-IP auth rate limits apply per student, not to the whole class behind Vercel's IPs. It maps errors with `errorKeyFor()` (same mapping, no logging; Supabase's auth logs keep the raw error).
9. **Dates only through `lib/date.ts`, in Asia/Tokyo.** Never call `toLocaleString()`/`toLocaleDateString()` or build "N days ago" by hand. "Today", "yesterday", day counts and any "this week" logic use Tokyo calendar days, not the server's UTC. Weeks start on Monday (there is no week helper yet — add one to `lib/date.ts` when the first weekly feature needs it).
10. **Form fields are at least 16px with a visible label.** A placeholder is an example, never the label. Use the right keyboard (`inputMode="numeric"` for whole numbers, `"decimal"` for hours, `type="email"` + `autoComplete="email"` for email). Errors sit under the field, linked with `aria-describedby` (see `components/form-errors.tsx`).
11. **The mockups in `docs/mockups/phase1/` are the design source.** Match their copy, colours and spacing. Don't build anything their README marks as phase 2.

## Data model

`profiles`, `classes`, `class_memberships`, `pairings`, `pairing_members`, `targets`, `progress_logs`, `nudges` (0001), plus `pod_invitations` (0003: `kind` is `invite` or `request`, `status` is `pending`/`accepted`/`declined`; accepting goes through the `accept_pod_invitation` function, 0004) and `progress_comments` (0008). A pod is a `pairings` row; its members are the `pairing_members` join table (NOT an array column — you can't write clean RLS against an array). `is_podmate(uuid)` is a `security definer` helper that every visibility policy calls.

## Scope discipline

**In (MVP):** auth, create/join class, student-formed pods (start, invite, request to join; up to 6), targets + deadlines, manual progress logging, shared pod view, one "stuck on" nudge, churn detection (display-only).

**Roadmap:** phase 1 gets the app ready for a pilot with a Japanese university class (Japanese/English UI, then the screens in `docs/mockups/phase1/`). Phase 2 adds the items the mockups README lists (notifications, milestones, weekly stats). **Phase 3, after the pilot: Google Docs automatic tracking.** It is no longer cut, but nothing is built for it before phase 3. The proof of concept lives only on the `spike/google-docs-poc` branch, as reference. It is not in `main` (it was merged by mistake in #23 and reverted in #24); never merge that branch — phase 3 starts fresh and can read it for ideas.

**Cut / out of scope — do NOT build these without being asked:** peer report feedback, cross-university stranger matching, open chat, gamification. These are deliberate cuts, logged as decisions. Don't "helpfully" add them.

## Working style

- This is a learning project the author must be able to defend. Explain what you're doing and why; don't just emit code.
- Ask before writing files or running commands that change things. Prefer showing a plan first for anything touching more than ~2 files.
- Keep UI minimal — visual polish is deferred to the final sprint. Don't spend effort on aesthetics now.
- Decisions of record live in Notion, not here. If a real architectural choice comes up, flag it so the author can log it.
