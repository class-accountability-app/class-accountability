# CLAUDE.md

Context for Claude Code. Read this before doing anything in this repo.

## What this project is

A class-scoped accountability app for university students. Students in the same class form small **pods of up to 6** and can passively see each other's progress. No chat, no coordination — mutual accountability, together. Solo-built capstone project, 7-week timeline (14 Jul – 28 Aug 2026).

Pods are formed by the students themselves, not auto-paired: anyone in a class can start a pod, invite classmates, or ask to join an existing pod; the invitee or the pod accepts or declines. The cap of 6 is a soft cap checked in the server action, not a DB constraint (see 0003/0004).

The core loop: sign up → join a class → start or join a pod → set a target → log progress → see podmates' progress → optional nudge.

Students log in with a 6-digit code or a button sent to their university email (andrew.ac.jp), often on a phone. That address works in both Gmail (Google Workspace) and Outlook, so never assume one mail app: the code screen links to both.

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

### RLS tests

`supabase/tests/*.sql` check what the database allows each kind of user (own row, podmate, classmate, outsider, logged out). Each file is ONE transaction that ends in `ROLLBACK`: it creates throwaway `rls-test-*@andrew.ac.jp` users, impersonates them with `set local role authenticated` + `request.jwt.claims`, and raises `FAIL: …` on the first broken rule. Success is a final row reading `all RLS tests passed`.

- Run a file as one script: Supabase MCP `execute_sql` or the dashboard's SQL editor (no Docker or `psql` needed). CI does not run them, since CI has no database.
- It runs on the live project, so ask first. Before and after, `select count(*)` from `auth.users`, `profiles` and `nudges` and confirm the counts match.
- When a migration changes a policy, trigger or grant, add checks for it here in the same PR.

## Non-negotiable rules

1. **Every Postgres table has RLS enabled.** A table without `enable row level security` is publicly readable via the anon key (which ships to the browser). Every migration that runs `create table` must also enable RLS in the same file. CI fails the PR otherwise.
2. **The `service_role` key is server-side only.** Never in client code, never in a `NEXT_PUBLIC_` var, never committed. The anon key is public by design and fine to use client-side — RLS is what protects data.
3. **Authorization lives in the database, not the app.** The privacy rule (you see a person's data only if you're podmates) is enforced by RLS policies, not by frontend checks. Targets, progress logs and comments use the `is_podmate_in_class()` helper (0013), so podmates see each other's work only within the pod's class. Frontend checks are UX, not security.
4. **The university-email restriction is enforced in a DB trigger**, not just the login form — the anon key lets anyone bypass the form.
5. **Schema changes go in `supabase/migrations/*.sql`**, committed to the repo — never by clicking in the Supabase dashboard. Note the folder is spelled `migrations` (this bit us once).
6. **`main` is protected.** Work on a branch, open a PR, let CI pass, merge. Never commit to `main` directly.
7. **Never use `getSession()` in `proxy.ts` for auth decisions — use `getUser()`**, which revalidates the token. `getSession()` trusts the cookie without verifying it.
8. **No hard-coded UI strings.** Every user-facing string lives in `messages/ja.json` and `messages/en.json` — add every new key to both (`npm test` fails if the files drift). Japanese is the default and uses polite です・ます form. Server actions return an error key from `lib/errors.ts`, never a raw Supabase/Postgres message; unexpected errors go through `toErrorKey()`, which logs code + message server-side (no emails or other user data). Login is the exception: `signInWithOtp` stays in the browser so Supabase's per-IP auth rate limits apply per student, not to the whole class behind Vercel's IPs. It maps errors with `errorKeyFor()` (same mapping, no logging; Supabase's auth logs keep the raw error).
9. **Dates only through `lib/date.ts`, in Asia/Tokyo.** Never call `toLocaleString()`/`toLocaleDateString()` or build "N days ago" by hand. "Today", "yesterday", day counts and any "this week" logic use Tokyo calendar days, not the server's UTC. Weeks start on Monday 00:00 JST: use `tokyoWeekStart()` (Prompt 11). The progress numbers on Home and the class page (今週, 残り○日, pace, milestones) are pure functions in `lib/progress-stats.ts`, with tests.
10. **Form fields are at least 16px with a visible label.** A placeholder is an example, never the label. Use the right keyboard (`inputMode="numeric"` for whole numbers, `"decimal"` for hours, `type="email"` + `autoComplete="email"` for email). Errors sit under the field, linked with `aria-describedby` (see `components/form-errors.tsx`).
11. **The mockups in `docs/mockups/phase1/` are the design source.** Match their copy, colours and spacing. Don't build anything their README marks as phase 2.

## Data model

`profiles`, `classes`, `class_memberships`, `pairings`, `pairing_members`, `targets`, `progress_logs`, `nudges` (0001), plus `pod_invitations` (0003: `kind` is `invite` or `request`, `status` is `pending`/`accepted`/`declined`; accepting goes through the `accept_pod_invitation` function, 0004) and `progress_comments` (0008). A pod is a `pairings` row; its members are the `pairing_members` join table (NOT an array column — you can't write clean RLS against an array). Visibility policies call `security definer` helpers: `is_podmate_in_class(user, class)` for targets, progress logs and comments (0013), and `is_class_member` / `is_class_student` for classes, memberships, pods and targets (0015). All policies apply `to authenticated` only (0015), so logged-out requests never evaluate one.

0011: `profiles.name_chosen_at` is null until the student saves a display name (a trigger stamps it; clients may update only `display_name`). The proxy sends anyone with a null value to `/welcome`. Name rules: 1–20 graphemes in the app (`lib/display-name.ts`); the DB enforces trimmed, no control characters and ≤ 80 code points. Nudges: max 3 per sender→recipient in a rolling 24 hours (trigger, error code `SP001`), and `pairing_id` must be a pod both people are in.

0014 (quick log): students can edit (amount and memo only) and delete their own `progress_logs`; `user_id`, `target_id`, `logged_at`, `client_id` and `source` never change (trigger), and a student's insert gets the server's `now()` as `logged_at`. `progress_value > 0` is a CHECK. `client_id` + `unique (user_id, client_id)` makes 記録する idempotent: `logProgress` treats that unique violation as already saved. Comments cascade with their log. Totals are always summed from the logs on read, never stored. The quick-log UI lives in `components/quick-log/`.

0015 (class organizers): only accounts with `profiles.can_create_classes` (set only by SQL as the project owner) can create classes. The creator's membership has `role = 'organizer'`; everyone who joins by code is `'student'` and `join_class_by_code` never changes a role. Organizers see their class, its join link and QR and the student count, nothing else: they aren't counted, can't be in, create, join or be invited to pods (`SP003`), can't create targets, and can't see students' memberships or profiles. Use `is_class_student` (not `is_class_member`) for anything about studying in a class.

0016 (leave a pod, delete my account): `leave_pod(pod)` removes only the caller's `pairing_members` row, deletes the invites they sent for that pod that are still pending, and deletes the pod once it's empty (its invitations and nudges cascade; nudges in a pod that still has members stay). `delete_my_account()` deletes `auth.users where id = auth.uid()` as postgres and everything cascades from `profiles`. Pods left empty and the caller's classes without students are removed too. The organizer of a class that still has students is refused (`SP004`). No service_role key is involved. The UI is `app/settings/delete-account/`: it signs out, clears the `name_ok` and `setup_done_seen` cookies (they hold the user id) and lands on `/?deleted=1`.

0017: `delete_my_account()` also deletes the caller's `auth.flow_state` rows (Supabase Auth's login state). That table has no foreign key to `auth.users`, so nothing cascades and Supabase never cleans it up. If Supabase adds another auth table with a user id but no FK, delete from it here too; the RLS test checks `flow_state`.

## Installed app (PWA)

- `app/manifest.ts` (served at `/manifest.webmanifest`), icons in `public/icons/` plus `app/apple-icon.png` and `app/favicon.ico` (the favicon is only the S, for tabs). Single theme: no dark mode.
- `public/sw.js` is a plain file with no build step, and Prompt 10's push handlers go in it too. It handles only same-origin GETs. Page loads (`mode: 'navigate'`) go to the network; if the network fails it serves `/offline.html`, never on a 404 or 500. Cache-first for hashed `/_next/static` (status 200 only, newest 150 kept) and for the offline page and icons. **Nothing else is ever cached**: no page, no `?_rsc` data, no server action, no Supabase. So sign-out and account deletion leave nothing of the student's behind. Bump `VERSION` when the cached files change; activate deletes old caches. `next.config.ts` serves it with `no-cache`.
- `public/offline.html` is static and bilingual on purpose: every App Router page renders the header and tab bar with the student's classes, so it must never be cached.
- The proxy skips `manifest.webmanifest`, `sw.js` and `offline.html` (`proxy.ts` matcher), and they're in `PUBLIC_EXACT` too. They must never redirect to /login.
- `components/pwa.tsx` registers the worker in production builds only (in dev it unregisters any old one) and catches `beforeinstallprompt`. `lib/install-hint.ts` decides 設定's 「ホーム画面に追加」 row.
- Installed iPhone apps have their own cookies: the email's button logs in Safari, not the app. The code screen tells students to use the 6-digit code there.

## Scope discipline

**In (MVP):** auth, create/join class, student-formed pods (start, invite, request to join; up to 6), targets + deadlines, manual progress logging, shared pod view, one "stuck on" nudge, churn detection (display-only).

**Roadmap:** phase 1 gets the app ready for a pilot with a Japanese university class (Japanese/English UI, then the screens in `docs/mockups/phase1/`). Phase 2 adds the items the mockups README lists (notifications, milestones, weekly stats). **Phase 3, after the pilot: Google Docs automatic tracking.** It is no longer cut, but nothing is built for it before phase 3. The proof of concept lives only on the `spike/google-docs-poc` branch, as reference. It is not in `main` (it was merged by mistake in #23 and reverted in #24); never merge that branch — phase 3 starts fresh and can read it for ideas.

**Cut / out of scope — do NOT build these without being asked:** peer report feedback, cross-university stranger matching, open chat, gamification. These are deliberate cuts, logged as decisions. Don't "helpfully" add them.

## Working style

- This is a learning project the author must be able to defend. Explain what you're doing and why; don't just emit code.
- Ask before writing files or running commands that change things. Prefer showing a plan first for anything touching more than ~2 files.
- Keep UI minimal — visual polish is deferred to the final sprint, except Home, which was redesigned in Prompt 11 (`docs/mockups/phase2/home.html`). Don't spend effort on aesthetics elsewhere.
- Page transitions are React `<ViewTransition>` in `components/page-transition.tsx` (no animation library), used by `template.tsx` at every level that has pages of its own (`app/`, `app/classes/`, `app/classes/[classId]/`, `app/settings/`): a template remounts only when the segment right below it changes, so a new folder with several pages needs its own. A fade between pages, a slide between the bottom tabs (`tabTransitionTypes` in `lib/nav.ts`), nothing under reduced motion. The header, tab bar and sticky ＋記録 are named in `globals.css` so they stay still; never wrap `{children}` in a layout with another `<ViewTransition>` (page enter/exit would stop firing).
- The link preview image `app/opengraph-image.png` is rendered from `docs/og-image/og-image.html`; change both together with the landing hero copy.
- Decisions of record live in Notion, not here. If a real architectural choice comes up, flag it so the author can log it.
