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

## Reachability: every control on Home (PR 2)

Home before PR 2 → after. Nothing becomes unreachable, and no control moves to a PR 3 tab yet, so no temporary links are needed in this PR.

| Control on Home today | After PR 2 | Moves in |
|---|---|---|
| 次にやること card: join code form, 参加リンクとQR, 招待を見る, 最初の目標を作る, 次の目標を作る | Same card, same place (top). Its button is the one filled button on Home. | – |
| 次にやること card, 「今日の分を記録しましょう」 and its 続きを書く / hint sentence | Merged into the **hero target card** (the first open target, with the one big filled button: ＋記録, 完了にする or 続きを書く) | PR 2 |
| 次にやること card: ポッドを作る + ほかのポッドに参加を申し込む | Same card, now **outlined**, under the hero (while a target is open; filled only if there is no target to log) | PR 2 |
| 次にやること card: 仲間を招待する, ポッドの様子を見る | Same outlined card, under the hero | PR 2 |
| 今週 summary | Unchanged | – |
| 新しい目標 (outlined) | Unchanged, same section | PR 4 changes the form |
| Target cards: ＋記録 / 完了にする / 書く on every card (up to 5, all filled) | The first open target is the hero (filled). The other cards keep their button, **outlined**. Same taps. | PR 2 |
| ほかに○件の目標があります → クラスのページで見る | Unchanged | PR 3 |
| 完了した目標 fold | Unchanged | – |
| **Sticky ＋記録 / 続きを書く bar (phones)** | **Removed from Home.** Logging is the hero's button: 2 taps, as before. The class page and the progress page keep their sticky bar until PR 3. | PR 2 |
| ポッドの様子: 声かけする, ポッドの進み具合を見る, 仲間を招待する, クラスを開く | Unchanged | PR 3 |
| 参加中のクラス links, コードで別のクラスに参加 | Unchanged | PR 3 |
| **あなたの最近の記録 (編集・削除)**: only on the progress page today | **New collapsed section at the bottom of Home** (closed by default). The progress page keeps its own. | PR 2 |
| Header and tab bar (ホーム / クラス / 声かけ / 設定, ログアウト) | Unchanged | PR 3 |
