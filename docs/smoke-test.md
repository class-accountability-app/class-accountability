# Smoke test (before the pilot)

A walk through every feature, end to end, on the live site. Most of what
shipped between 2026-10-30 and 2026-11-02 is covered by unit tests and the
RLS tests in `supabase/tests/`, but not by anyone tapping through it. This
script is for the author: the assistant never signs in as anyone (CLAUDE.md,
Working style).

**You need**
- The organizer account (`O`).
- Three student test accounts, `A`, `B`, `C`: addresses in
  `private.allowed_test_emails` (never written in the repo). Test accounts are
  left out of research automatically.
- Two devices or browser profiles (one per person at a time). A phone for the
  push and offline steps; iPhone needs the app added to the home screen.
- A Google account for `A` with one Doc, one Slides file and one Sheet you can
  pick (any content; a Google Form's responses sheet is ideal).

Tick each box. Anything that doesn't match the **Expect** line: note the step
number, the account and a screenshot, and send it to me.

When you're done, reset with `docs/demo-reset.md` if you want a clean demo.

---

## 1. Login and first run

- [ ] 1.1 `A` opens the site, enters the email, gets the code mail. **Expect:**
  6-digit code and a button; the code screen links to Gmail and Outlook.
- [ ] 1.2 `A` enters the code. **Expect:** 「表示名を決めましょう」; saving a
  name goes to Home.
- [ ] 1.3 Settings → language switch to English and back. **Expect:** the
  whole UI changes, no untranslated keys (`project.xyz`-style text).

## 2. Organizer: class, teams, names, swap (0036, 0039)

- [ ] 2.1 `O` opens the class page. **Expect:** join link + QR, student count,
  チームの管理, お知らせ, 目安, the class project list (add, edit, remove; several at once), the team summary.
- [ ] 2.1b (0045) `O` opens 「＋ プロジェクトを追加」, adds a second project with
  two tasks. **Expect:** it appears in the list; every existing team's board
  and Home show a switcher with both projects; the team summary has a line per
  project. 「リストから外す」 removes it from the list only: teams keep it.
- [ ] 2.1c (0046) `O` taps 「このチームのボードを見る」 on a project line of the
  team summary. **Expect:** that team's tasks with owners and numbers,
  check-ins made after 2026-11-14 12:00 JST with their notes, meetings and
  team links; no button or field anywhere; pills to the other teams on the same
  project and to the team's other projects. `A` opening the same URL gets 404.
  `A`'s Home shows 「先生に見えるものが変わりました」 once, until わかりました.
- [ ] 2.2 `A`, `B`, `C` join the class with the code or QR. **Expect:** `O`'s
  student count goes to 3; チームの管理 lists all three without a team.
- [ ] 2.3 `O` ticks `A` and `B`, names the team, 「チームを作る」. **Expect:**
  a team card with A and B; `C` still without a team.
- [ ] 2.4 `O` uses `C`'s 「チームに入れる…」 menu → the A/B team. **Expect:**
  C moves into it (3 members).
- [ ] 2.5 `O` makes a second team: move `C` out (「チームから外す」), then make
  a team of `C` alone. Then on `A`'s menu pick 「…の人と入れ替える」 → `C`.
  **Expect:** A and C have changed teams; both teams keep their size.
- [ ] 2.6 Put everyone back as you want them for the rest (A, B, C in one team
  is easiest). **Expect:** the team summary lists each team with its members'
  names, no numbers per person.
- [ ] 2.7 `O` posts an お知らせ. **Expect:** students see it on their board and
  class page; with push on (step 8), a push 「先生からお知らせが届きました」.

## 3. Project and tasks

- [ ] 3.1 `A` opens the board → start a project from a template (e.g. 発表).
  **Expect:** tasks appear, without owners; due dates not before today.
- [ ] 3.2 `A`, `B`, `C` each 「担当する」 one or more tasks. **Expect:** tasks
  group under each person; unclaimed ones stay under
  「担当が決まっていません」.
- [ ] 3.3 `A` adds a task: count, unit "words", goal 100. Another: count, unit
  "answers", goal 5. **Expect:** both appear under 「担当が決まっていません」 until claimed.
- [ ] 3.4 Team name: a student renames the team on the board. **Expect:** `O`
  sees the new name in チームの管理 and the summary.
- [ ] 3.x (0047) `A` opens 「困っていると伝える」 on their own open task, types
  one line, 「伝える」. **Expect:** `B` sees 「困っています：…」 on that task;
  `B` has no way to clear it; `O`'s team board does not show it. `A` taps
  「解決した」, or finishes or hands over the task: the line is gone.

## 4. Logging

- [ ] 4.1 `A` ＋記録 on a counted task (chips, then 記録する). **Expect:**
  「記録しました」; the bar moves; teammates see the new total (live).
- [ ] 4.2 Double-tap 記録する quickly. **Expect:** one entry, not two.
- [ ] 4.3 Offline: phone in airplane mode, ＋記録. **Expect:** 「オフラインです。
  この端末に保存しました…」. Airplane mode off, open the board. **Expect:** the
  entry arrives once, within a few seconds.
- [ ] 4.4 「Study Pods で書く」 on a characters task with nothing logged: write
  two sentences, wait for 「保存しました」. **Expect:** the count on the board
  matches the editor's; teammates see the count, never the text.

## 5. Google (0023, 0026, 0040; templates and one file per task, 2026-11-08)

Headings never count: only body text and tables do. So compare with Google
Docs' count of the body, not of the whole Doc when it has headings.

- [ ] 5.1 `A`: board → 「Google とつなぐ」 → consent (drive.file only).
  **Expect:** back on the board, 「Google とつなぎました。」; the Google card says
  each owner makes their own file (no 「グループのドキュメントをつくる」).
- [ ] 5.2 On `A`'s unlinked characters task: 「Google ドキュメントをつくる・つなぐ」
  → 「すでにあるファイルとつなぐ」 → 自分のドキュメント → pick `A`'s Doc. **Expect:**
  within ~5 min (or on reopening the board) the count appears and matches
  Google Docs' character count without spaces, less any heading lines.
- [ ] 5.3 Link the "words" task → 「ドキュメントの英単語数」 → an English Doc.
  **Expect:** the number matches Google Docs' word count (Tools → Word count)
  within a word or two, less any heading lines.
- [ ] 5.4 Link the "answers" task → 「Google スプレッドシートの行数」 → the
  Form's responses Sheet. **Expect:** number of responses (header not counted).
  Submit one more Form response, reopen the board: +1.
- [ ] 5.5 Delete a response row in the Sheet. **Expect:** the total goes down
  by one at the next count.
- [ ] 5.6 Push the Sheet's count to the goal (5). **Expect:** the task turns
  完了 by itself (auto-done).
- [ ] 5.7 Link a count task to Slides. **Expect:** the slide count.
- [ ] 5.8 **Doc from a template.** A new characters task (ほかで書く) of `A`'s →
  「Google ドキュメントをつくる・つなぐ」 → 「テンプレートから新しいドキュメントを作る」 →
  レポート → 「つくってつなぐ」. **Expect:** back on the board; the task shows
  Google ドキュメント「<task>（<A's name>）」 and 0 字; 「ドキュメントを開く」 opens a
  Doc with that name in `A`'s Drive, the task as its title and はじめに … おわりに
  as headings; it is shared with nobody. Type 10 characters under a heading
  and 5 into a heading line: the task shows 10.
- [ ] 5.9 **Slides from a template.** A count task of `A`'s (unit 枚) → 「Google
  のファイルをつくる・つなぐ」 → テンプレート: 研究発表 → 「つくってつなぐ」. **Expect:**
  0 枚; the deck has a cover with the task's title and 背景 / 目的 / 方法 / 結果 /
  考察 / まとめ / 参考文献, and no blank first slide. Type into one slide's
  body: 1 枚. Add an image to another: 2 枚. Add a new slide of your own: 3 枚.
  If 「つくってつなぐ」 shows an error instead, note the time: the server log has
  `createTaskSlides.write` with Google's reason.
- [ ] 5.10 **Sheet from a template.** Another count task of `A`'s → same card →
  アンケートの回答. **Expect:** 0; the Sheet's first row is 回答日 / 回答者 / 学年 /
  質問1–3 / 自由回答, bold and frozen. Fill two rows: 2.
- [ ] 5.11 **Change the file.** On the task from 5.8, 「ファイルを変える」 →
  「ほかのファイルに変える」 → pick the Doc from 5.2. **Expect:** the board shows
  the other Doc's name, and after the next count the task's number is that
  Doc's count (not the two added together).
- [ ] 5.12 `B` (a teammate) opens the board. **Expect:** `A`'s tasks show
  their numbers but no open or change buttons; the link page of `A`'s task
  has no 「新しくつくる」 card for `B`.
- [ ] 5.13 Settings → 「Google との連携を解除する」. **Expect:** linked tasks show
  「ファイルが読めなくなりました」 with the file's name at the next count, numbers so
  far kept.

## 6. Check-ins, timeline, order

- [ ] 6.1 `A` 「チェックインする」 with a note (try a starter prompt chip).
  **Expect:** it appears in 「みんなのチェックイン」; a second one in the same round is
  refused.
- [ ] 6.2 タイムライン: open it. **Expect:** a bar per task with a due date; a
  late one in red; 「カレンダーに追加」 opens Google Calendar.
- [ ] 6.3 タスクの順番: set "B's task after A's task". **Expect:** 「待っています：…」
  on B's task until A's is done; a loop is refused.
- [ ] 6.4 Give one person 3+ more open tasks than another. **Expect:** the
  re-balance hint appears.

## 7. Meetings

- [ ] 7.1 `A` creates a poll: pick 3 times on the week grid, deadline 1 day.
  **Expect:** the poll page with the vote grid.
- [ ] 7.2 `B` and `C` vote. **Expect:** tallies update; the best time is marked.
- [ ] 7.3 Confirm a time. **Expect:** the board's 次の打ち合わせ card shows it;
  Google Calendar and .ics links work; 打ち合わせのメモ saves and shows who
  updated it.

## 8. Push (phone)

- [ ] 8.1 Settings → 声かけの通知 on (iPhone: from the home-screen app).
  **Expect:** permission prompt, then on.
- [ ] 8.2 `B` sends `A` a 声かけ. **Expect:** a push on `A`'s phone within a
  minute (unless 23:00–07:00 JST: then at 07:00).
- [ ] 8.3 Tap the push. **Expect:** it opens the app at 声かけ (or the board for
  board pushes), never anywhere else.
- [ ] 8.x (0048) Give `A` a task due tomorrow, with push on. **Expect:** at
  09:25 JST the next morning `A`'s phone shows 「「…」の締切は明日です」 once;
  `B` gets nothing; a done task or a task with no owner sends nothing.

## 9. Teacher milestones and team view

- [ ] 9.1 `O` adds a 目安 "30% by <a date next week>". **Expect:** students see
  it under the project's %; `O` sees "n/m teams reached".
- [ ] 9.2 `O`'s team summary: **Expect:** each team's %, on track / behind,
  last activity, check-ins this round, member names; CSV download opens in
  Excel without garbled Japanese.

## 10. Finish and wrap-up

- [ ] 10.1 `A` 「プロジェクトを完了する」 (confirm). **Expect:** the board shows
  the start form and 「これまでのプロジェクト」; editing old tasks is refused.
- [ ] 10.2 Open the finished project's まとめ. **Expect:** tasks, owners, final
  numbers, each member's done/owned and check-ins.
- [ ] 10.3 「このタスクで新しいプロジェクトを始める」. **Expect:** a new project
  with the same tasks, no owners, no progress.

## 11. Leaving and deleting

- [ ] 11.1 `C` leaves the team. **Expect:** C's tasks move to 「担当が決まっていません」 with their
  numbers kept.
- [ ] 11.2 `C` deletes the account (Settings → アカウントを削除, type 「削除」).
  **Expect:** signed out, landing page; `O`'s student count drops by one.
- [ ] 11.3 Sign out of `A` with something queued offline or an unsaved draft.
  **Expect:** a warning first.

## After

- Count `auth.users` again if you used new test addresses; run
  `docs/demo-reset.md` (dry run first) for a clean demo.
- Logged-in accessibility: Lighthouse in Chrome DevTools on the board, the
  class page and Settings (CLAUDE.md: never with a captured session).
