# Prompt 15 baseline: what the links do today (recorded in PR 1)

PR 3 turns `/nudges`, `/classes/[id]` and `/classes/[id]/progress` into redirects for
students. This is how they behave on `main` before that, so PR 3 can compare.
Recorded 2026-10-15 against a local dev server on the PR 1 branch; none of these
pages change in PR 1.

## Logged out (checked with curl: status and Location)

| Request | Result |
|---|---|
| `/nudges` | 307 → `/login?next=%2Fnudges` |
| `/join/K7M3Q9TX` | 307 → `/login?next=%2Fjoin%2FK7M3Q9TX` |
| `/classes/{id}` | 307 → `/login?next=%2Fclasses%2F{id}` |
| `/classes/{id}/progress` | 307 → `/login?next=%2Fclasses%2F{id}%2Fprogress` |
| `/welcome?next=/join/K7M3Q9TX` | 307 → `/login?next=%2Fwelcome%3Fnext%3D%252Fjoin%252FK7M3Q9TX` |
| `/start/pod?class={id}` (new in PR 1) | 307 → `/login?next=%2Fstart%2Fpod%3Fclass%3D{id}` |

After login, `safeNextPath()` brings the student back to `next`. `/welcome` is on its
exclusion list, so a student who is sent to `/welcome` first comes back to the
`next` inside it (the invitation).

## The push path (声かけの通知)

- The push payload carries no URL. `public/sw.js` `notificationclick` always opens
  `/nudges`: it focuses an open window and navigates it there, else opens one.
- `/nudges` is today the list of nudges I **received** (newest first, 50), the
  one-time push card, and an empty state with a link to the pod.
- PR 3 makes `/nudges` redirect to `/pod`. `sw.js` must not need to change: the
  redirect has to land on the received nudges, logged in or out (logged out it
  goes through `/login?next=%2Fnudges` as above).

## Fragments on the class page

Fragments never reach the server, so they survive a redirect only because the
browser re-applies them. Today:

| Link | Where it comes from | What it targets |
|---|---|---|
| `/classes/{id}#invite` | next-step 「リンクとQRを表示」 (organizer) and 「仲間を招待する」 | Student: the 仲間を招待する section (the link/QR disclosure is closed; the fragment scrolls to the heading, it does not open it). Organizer: the link and QR card, always visible. |
| `/classes/{id}#invitations` | next-step 「招待を見る」 | The あなたへの招待 section, which exists only while I have a pending invitation; otherwise the fragment points at nothing and the page opens at the top. |
| `/classes/{id}#other-pods` | next-step 「ほかのポッドに参加を申し込む」 and, since PR 1, the first-run pod step | The ほかのポッド list, shown only while I have no pod. |

PR 3 must keep all three working for a student: whatever replaces the class page
has to carry these anchors (or open the matching section), and an organizer keeps
`/classes/{id}#invite` exactly as it is.

## Logged in (to check with testb / testc)

To be filled in during the PR 1 logged-in checks: `/nudges` loads; `/classes/{id}#invite`
and `#invitations` scroll to the sections above.

## Known polish, separate branch

Not part of PR 1 and not fixed here (no code change):

- **Step 1 of the first-run flow (`/welcome`, class invitation): a notebook line runs through the hint line** 「ニックネームでも大丈夫です。あとから「設定」で変えられます。」 ("A nickname is fine…"), seen at 390px in the live walkthrough. The hint is 13px text without `leading-7`, so it isn't on the 28px rule; the same applies to other pages that haven't been reworked onto the rule (CLAUDE.md: "other pages get the same lines but their spacing hasn't been reworked yet").
- Investigation and three options (ruled lines fixed, dot grid, plain paper with a margin line) are on the local branch `fix/notebook-background` (`docs/mockups/notebook-background.html`), waiting for a pick. Nothing there touches PR 1.
