# Prompt 12 part 2: editor app code — approved plan

Written by Claude Code on 2026-10-02 (session before 15:50 JST), reviewed by Claude (chat) and approved by Sai with the changes in "Review changes" below. 0019 is already live and verified; this plan does not change the database.

Prompt: `claude/prompt12-writing-editor.md` (Project doc). Branch: `feat/writing-editor` (main merged at 81c62a4; parseAmount tests 2dc894b).

## Skills
- `tiptap` (installed with Sai's approval in Prompt 11) for the editor.
- `anthropic-skills:docx` to open the generated .docx and check it.

## Packages and licences (latest on npm on 2026-10-02)

| Package | Version | Licence |
|---|---|---|
| @tiptap/react, /core, /pm, /starter-kit, /extensions | 3.31.4 | MIT |
| ↳ prosemirror-* (13 packages), fast-equals, use-sync-external-store, orderedmap, rope-sequence, w3c-keyname, linkifyjs | | MIT |
| docx | 9.8.1 | MIT |
| ↳ xml, xml-js, nanoid, hash.js | | MIT |
| ↳ jszip 3.10.2 | | MIT or GPL-3.0 (used under MIT) |
| ↳ pako | | MIT and Zlib |
| ↳ lie, setimmediate, immediate, readable-stream | | MIT |
| ↳ inherits, minimalistic-assert | | ISC |
| ↳ sax (through xml-js) | | BlueOak-1.0.0 (permissive) |

- No Tiptap Pro or paid extension. StarterKit includes underline, both list types and undo/redo. CharacterCount is not used; we count ourselves.
- Switched off: code, code blocks, quotes, strikethrough, links, horizontal rules. Paste drops them.
- Indent: a small custom extension.
- After npm install, list the licences of the installed tree to confirm this table.

## Files

New pure logic, each with unit tests:
- `lib/char-count.ts`: Word's 文字数（スペースを含めない）. (A first version and its test already exist uncommitted from the earlier session; check them against the 10 examples below.)
- `lib/doc-schema.ts` (or similar): server-side validation of the editor JSON — allowed nodes (paragraph, heading levels 1–2, bullet list, ordered list, list item, text, hard break), marks bold/italic/underline, indent attribute 0–4, a depth limit.
- `lib/paste-word.ts`: turns Word's MsoListParagraph paste into real lists.
- `lib/docx-export.ts`: the test unzips the generated file and checks paragraphs, styles, text and the count.
- `lib/editor-extensions.ts`: one extension list, shared by the editor, the preview and the server check.
- `lib/local-draft.ts`: unsaved changes in IndexedDB, key `userId:targetId`; `clearAll()`.
- `lib/autosave.ts`: the state machine (below), pure reducer.

New editor route `app/classes/[classId]/targets/[targetId]/write/`:
- `page.tsx` (server): reads the document under RLS; no-store.
- `editor.tsx` (client).
- `toolbar.tsx`: labels, aria-pressed, Word's shortcuts (Ctrl/Cmd+B, I, U, Z, Y).
- `save-status.tsx`.
- `conflict-dialog.tsx`.
- `history-panel.tsx`: list, read-only preview, restore.
- `export-menu.tsx`.
- `use-autosave.ts`: timers, online/offline and visibility events driving the reducer.
- `actions.ts`: saveDocument, keepMine, listVersions, getVersion, restoreVersion. Each checks the JSON against the schema, recounts the characters on the server, and calls the 0019 RPCs (save_document, keep_document_version).
- `print/page.tsx`: the PDF view. JSON rendered as React elements (no dangerouslySetInnerHTML); @page A4; page numbers in Chrome and Edge.

Changed:
- 新しい目標: `target-form.tsx` gets 「自分で記録する / Study Pods で書く」 for character-count targets, in mockup 07's slot. createTarget sets input_mode.
- `components/quick-log/target-card.tsx`: a document target shows 「書く」 instead of ＋記録. The sticky button becomes 「続きを書く：…」.
- `components/quick-log/load.ts`: also reads input_mode.
- `lib/next-step.ts`: when the most urgent target is a document, "log today" becomes 「続きを書く」, with a button.
- Sign-out: `components/sign-out-form.tsx` warns in the page if something is unsaved, then clears the drafts. (No Clear-Site-Data — see review changes.)
- `/login`: wipes all drafts on load.
- Delete account: `delete-form.tsx` clears the drafts; the list of what's deleted gets 「書いた文章」.
- Privacy page: wording shown to Sai first, then the page, messages and 最終更新日.
- Strings: `messages/ja.json` and `messages/en.json`.
- `CLAUDE.md`: the editor, privacy, and "research metrics use counts only, never text".

## Autosave state machine (`lib/autosave.ts`)

States: `saved`, `dirty`, `saving`, `savingDirty` (typed during a save), `retrying`, `conflict`.

| Event | Effect |
|---|---|
| EDIT | saved → dirty; saving → savingDirty. The draft goes to IndexedDB at once. |
| QUIET_1500MS / MAX_10S / FLUSH (blur, tab hidden, 今すぐ保存, leaving) | dirty → saving, sending the base version. Held while IME composition is open; fires at compositionend. |
| SAVE_OK(version) | saving → saved; the draft is deleted if it matches. savingDirty → saving again from the new version. |
| SAVE_FAIL (network or 5xx) | → retrying. Backoff 2s, 4s, 8s … up to 30s. ONLINE retries at once. The draft stays. |
| SAVE_CONFLICT(theirs) | → conflict. Autosave stops until the student chooses. |
| CHOOSE_MINE | Theirs is kept as a version (p_keep_current = 'conflict'), then mine is saved over the server's version. |
| CHOOSE_THEIRS | Mine goes to keep_document_version, then theirs loads. |
| beforeunload while not saved | The browser's "leave page?" prompt. (No sendBeacon — see review changes.) |

Status line: 保存しました（14:05）, 保存中…, or 保存できていません（再試行します） with a 今すぐ保存 button.

Tests: every transition, including typing during a save, offline then back online, a conflict during a retry, and composition holding the save.

On load: a draft newer than the server version is offered back. If the server version moved since the draft was made, that's the same conflict choice. A draft belonging to another user is wiped. Drafts older than 7 days are dropped.

## Character count: 10 examples

Rule: grapheme clusters (Intl.Segmenter), skipping any cluster that is whitespace (half- and full-width spaces, tabs, line breaks). Paragraph breaks add nothing.

| # | Text | Count |
|---|---|---|
| 1 | "" (empty) | 0 |
| 2 | こんにちは | 5 |
| 3 | こんにちは 世界 (half-width space) | 7 |
| 4 | こんにちは　世界 (full-width space) | 7 |
| 5 | 一行目⏎二行目 (line break) | 6 |
| 6 | ⇥字下げ (tab) | 3 |
| 7 | Hello, world! | 12 |
| 8 | 「レポート」です。 | 9 |
| 9 | 😀👍🏽 👨‍👩‍👧 (skin tone and family ZWJ, 1 each) | 3 |
| 10 | 　本研究では、AI を 3 つの観点から検討する。⏎（1）背景 | 26 |

Extra tests: １２３ＡＢＣ = 6; か + combining ゙ = 1. Word may count emoji and combining marks differently; compare with a real exported file. Ordinary Japanese and English must match.

## Decisions used
- .docx: no title added (Sai's decision), so Word's count equals ours. A4, 游明朝 with MS 明朝 fallback, headings as Word's 見出し 1/2, lists as Word numbering, indent 2 字 per level.
- Limits: 100,000 characters, 1 MB JSON, 50 versions — already enforced by 0019.
- Accepted gap: the count passed to save_document comes from our server action. A student calling the RPC directly could claim a higher count for their own target only — same trust as ＋記録; the 1 MB limit still caps the text. 0019 stays as it is.

## Review changes (approved by Sai — these override anything above)
1. No sendBeacon. Rely on the IndexedDB draft plus the beforeunload prompt.
2. No Clear-Site-Data on sign-out (it would also unregister the service worker). Clear drafts in the page before sign-out; also wipe all drafts when /login loads; drop drafts older than 7 days on editor load.
3. Never two filled buttons in one area when 「続きを書く」 replaces "log today".
4. In the PR, note that reloading the editor while offline shows offline.html (typing while offline is never lost).
5. After npm install, list the installed licences.
6. Give Sai the Japanese IME checklist (MS-IME and iPhone) with the PR.
7. Show the privacy wording before changing the page.

## Tests (from the prompt)
- Unit: char count (10 examples + extras), autosave reducer, version-conflict handling, schema validation, paste-word, .docx generation (unzip and check).
- Rerun all RLS files (0019 included).
- Dev test as testc (production build): write with headings and lists, reload; offline while typing; two tabs conflict; paste from Word; export .docx and PDF; restore a version; testd (podmate) sees count only and can't fetch the text (URL and direct query).
- 390px and 1440px screenshots: editor, toolbar, export menu, history, 新しい目標 with the new choice. Lighthouse ≥ 95 on the editor (Sai runs it).
- Typecheck, lint, tests, build, security review. Push, open a PR, CI green. Don't merge.
