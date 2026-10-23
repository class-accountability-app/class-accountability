# Plan: group projects, automation first (Google auto-logging, meeting polls, stalled-task nudges)

## Context
The group-projects pivot is already underway: plan of record `docs/plans/group-projects-plan.md`, with #55 (plan), #56 (phase 4 mockup) and #57 (0022 schema, applied live) merged, and the pure libs (`lib/tasks.ts`, `lib/checkin.ts`, `lib/project-stats.ts`) merged in #58. This plan extends that one and wins where they differ (PR order, migration numbering). The author now wants **automation to be the priority**: students should log progress with as little effort as possible. Google Docs tracking moves up from phase 3 into this pivot. Two more things are added: a **Rallly-style poll** to schedule live check-up meetings, and **stalled-task nudges**.

Decisions made with the author (2026-10-24):
- **Connect Google once**, done on the server, and synced every 5 minutes. The student signs in to Google in the app and picks a file. The server re-counts it on a schedule and whenever the app opens. Nothing to install, and it works on phones. (Not an add-on or a Chrome extension.)
- **Mapping:** a task links either its own file (a Doc gives a character count, a Slides file a slide count) or a heading section of one shared group Doc.
- **Check-ups = live meeting + snapshot:** a poll picks the meeting time, and the existing 0022 check-in snapshot is the "before the meeting" share.
- **Extras:** stalled-task nudges only (the owner alone is told).
- Unchanged: document text is never stored or shown to anyone (the 0019 spirit). Only counts leave Google. Organizers still see nothing of pods.

## Scope changes to flag (log in Notion)
- CLAUDE.md says "no coordination". A meeting poll is coordination, though not chat, which stays cut.
- Google tracking moves from phase 3 to now. Build it fresh and only read `spike/google-docs-poc` for ideas (its `lib/google/tokens.ts`, `app/api/google/*`, `lib/google/counts.ts`). Never merge that branch.
- The in-app editor (Prompt 12) stays as the non-Google fallback. Re-keying it to tasks (old PR 5) moves after the automation work.

## 1. Google auto-logging (the core)

**Google Cloud setup (the author does this by hand, then I document it):**
- One OAuth client, scope **`drive.file` only**. It is non-sensitive, so there is no security assessment, and the app can see only the files a student picks or the app creates.
- Turn on the Docs, Slides, Drive and Picker APIs.
- The consent screen must be **In production**. In Testing mode, refresh tokens expire after 7 days and only 100 users are allowed.
- Brand verification needs the home page and the privacy page (`app/privacy/page.tsx` gets the Google "Limited Use" disclosure).
- The connected Google account may differ from the andrew.ac.jp login. This is the fallback if the university's Workspace blocks third-party apps.

**Data (next free migration, `0023_google_sources.sql`; the old 0023/0024 shift up by one):**
- `private.google_credentials`: `user_id` PK → profiles (cascade), `refresh_token_enc` (AES-GCM with server key `GOOGLE_TOKEN_KEY`, never sent to a browser), `google_sub`, `connected_at`. It lives in the `private` schema, so the API never exposes it and there are no grants to anon or authenticated. Written only by `security definer` RPCs that the server calls.
- `task_sources`: `task_id` PK → project_tasks (cascade), `kind` (`doc` | `doc_section` | `slides`), `file_id`, `heading_id` (for sections), `label` (a name the student types, not doc text), `linked_by` (whose token reads it), `state` (`ok` | `lost_access`). **No numbers or activity times.** Pod members can read it (via `is_project_member`); writes go only through RPCs.
- `private.task_source_sync`: `last_count`, `last_checked_at`, `last_changed_at`. Clients can't read it. The owner gets their own status through `my_task_sync_status(task)`. This keeps the 0022 rule: a teammate sees a member's numbers only through check-ins.
- Extend the `project_tasks.source` / `task_progress.source` checks with `google_slides`. Allow negative values for `google_*` sources, the same as `document` (deletions lower the count).
- RPC `record_synced_count(task, count)`, granted to `service_role` only. It logs `count - last_count` as a `task_progress` row (source `google_docs`/`google_slides`) and updates `last_*`. So the sum of the logs always equals the live count, matching the 0019 approach. Students still can't insert `google_*` rows, because the 0022 policies already require `source = 'manual'`.
- RLS test `supabase/tests/rls_google_sources.sql`: no client can read `private.google_credentials` or call `record_synced_count`; podmates see `task_sources` and the counts; outsiders and organizers see nothing.

**App:**
- `lib/google/` (fresh):
  - `oauth.ts`: connect, callback and revoke. The state is checked through a short-lived cookie, as in the spike.
  - `tokens.ts`: encrypt and decrypt, refresh.
  - `fetch-counts.ts`: Drive `files.get?fields=modifiedTime,version` first, and the content is fetched only when it changed.
  - `doc-sections.ts`: pure and tested. It walks the Docs API `documents.get` body and collects the text under a heading up to the next heading of the same or higher level.
  - `slides.ts`: the slide count from `presentations.get?fields=slides.objectId`.
  - Characters are counted with the existing `lib/char-count.ts`, so a Google Doc and the in-app editor give the same number. Text exists only in memory and is never logged or stored.
- **"Create the group Doc" button (the low-hassle path):** the app creates a Google Doc in the student's Drive with one heading per task, shares it with podmates' emails, and links each task to its section in one tap. `drive.file` covers files the app created.
- **Link an existing file:** Google Picker. Risk: the Picker on iPhone Safari is weak. Check this first, and on phones fall back to "link it on a computer" or to the created Doc.
- Settings row: connected / disconnect (revokes at Google and deletes the row). `delete-account` revokes first, best effort, and the row cascades anyway.
- Sync on open: the project board and Home call `syncMyProjectSources()`, throttled to at most once per file every 2 minutes.

**Background sync:**
- A new Edge Function `sync-google-progress`, using the same HMAC-signed pg_net pattern as 0018 (`_shared/signature.ts`, the secret in Vault, `verify_jwt = false`).
- pg_cron runs it **every 5 minutes, 07:00–24:00 JST** (author's choice: near-live board), for every `task_sources` row whose project deadline hasn't passed. Each run first makes one cheap Drive `files.get?fields=modifiedTime` call per file and re-reads the content only when it changed, so most runs fetch nothing.
- Cost guard: a file that hasn't changed for 24 hours drops to a 30-minute check until it changes again. One run handles at most N files (batched), and the board shows "updated ◯ min ago".
- A revoked or unreadable file sets `state = 'lost_access'`, and the board shows "ask ◯◯ to reconnect, or relink".

## 2. Meeting poll (Rallly-style)
- Migration:
  - `meeting_polls` (`project_id`, `created_by`, `title`, `duration_minutes`, `status` open/confirmed/cancelled, `chosen_option_id`, `vote_by`).
  - `meeting_poll_options` (`poll_id`, `starts_at timestamptz`, 2–8 per poll).
  - `meeting_poll_votes` (`option_id`, `user_id`, `answer` yes/maybe/no, unique per option and user).
- RLS: project members read everything and create polls; each person writes only their own votes; any member may confirm (consistent with "any member edits"). Organizers are blocked (SP003 semantics).
- UI under `app/classes/[classId]/project/meetings/`:
  - Create: pick 2–8 slots, each 16px+ and labelled.
  - Vote grid: one row per slot with ○ / △ / ✕, built for phones.
  - Best-slot summary (pure `lib/meeting-poll.ts`, tested): yes counts first, then maybe counts.
  - Confirm.
- All times are shown through `lib/date.ts` in Asia/Tokyo.
- The meeting page shows each member's latest check-in snapshot as the agenda. The 24h-before reminder says "share your check-in" to anyone who hasn't submitted one in the current round. The 0022 round math is unchanged.

## 3. Stalled-task nudges
- pg_cron daily at 09:00 JST. A task that isn't `done`, has an owner and has had no progress for 3 days (`last_changed_at` or its latest `task_progress`) gets one push to the **owner only**. It fires once per stall and resets when progress resumes. Teammates are never told.

## Push generalization (needed by 2 and 3)
- Today the only push path is `send-nudge-push`, fired by a trigger on `nudges`. Generalize it to `send-push` with a `kind` (`nudge`, `poll_created`, `meeting_confirmed`, `meeting_reminder`, `task_stalled`). The HMAC, quiet hours (`push_held_nudges` → a generic held table) and the "always exactly one request" rule stay.
- Message `push` keys go in both ja/en. The existing test that checks the function text against the messages is extended.

## PR order (a branch per PR, CI green, self-merge per memory)
1. ~~Finish `feat/project-libs`~~ (merged in #58).
2. Docs:
   - this plan, plus pointers in `docs/plans/group-projects-plan.md` and CLAUDE.md (automation first, poll, numbering);
   - mockup `docs/mockups/phase4/automation.html` (connect, group Doc, link, board, poll, vote, meeting, stalled push; rule 11: mockups first).
   - The privacy page wording waits for PR 5, so it never describes something that isn't live yet.
3. Project board + tasks + manual logging UI (the existing PR 4; the base everything links to).
4. `0023_google_sources.sql` + RLS test + error codes in `lib/errors.ts`.
5. Connect, create the group Doc, Picker linking, sync on open + `lib/google/*` tests, plus the privacy page's Google wording.
6. Background sync Edge Function + cron.
7. Push generalization + stalled-task nudges.
8. Meeting polls + reminders; check-in submit UI (the existing PR 6) lands here too.
9. Then the remaining work from the existing plan: editor re-key, research metrics (counts from `task_progress` include `google_*`), then the teardown after an explicit go-ahead.

## Verification
- Every PR: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- Pure tests:
  - section extraction and counting against **fixture JSON** (made from the author's own test Doc, never students' files);
  - slide counts;
  - delta logging math;
  - best-slot ranking;
  - stall detection.
- RLS files run on the live project via Supabase MCP only after asking. `auth.users` / `profiles` / `nudges` counts must be equal before and after, and the final row must read `all RLS tests passed`.
- Manual, with test accounts only (no session or token capture):
  - connect the author's Google account, create the group Doc, type in it and see the board update after reopening and after the cron run;
  - add a slide and see the count rise;
  - revoke access in Google and see `lost_access`;
  - run the poll with 3 test students on phone width, in ja and en.
- Early risk checks:
  - does andrew.ac.jp Workspace allow the OAuth app (the author tries with their own account);
  - does the Picker work on iPhone Safari.

## Other ideas (not in this plan; for later)
- Project templates (presentation / report / poster) that create tasks and milestones counted back from the deadline.
- A contribution summary at the end (counts only; not peer feedback, which stays cut).
- A links hub + .ics calendar export for the deadline and meetings.
- Task dependencies ("waiting on the script").
- A presentation rehearsal timer per speaker.
- A workload-balance hint when assigning tasks.
- An organizer view of the pods' overall status. This would change the current privacy design, so it is a separate decision.
