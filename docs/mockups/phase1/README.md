# Phase 1 app mockups

Phone mockups (390px wide) for the Study Pods app, Japanese UI.
Each screen has a .png (how it looks) and an .html (exact copy, colours, spacing).
Screens 16 and 17 are design-canvas source files (.dc.html, Japanese and
English inside each): read them for layout, copy, colours, type and motion.
The built pages differ on purpose where the app changed since (see the
landing copy in messages/*.json).
All names, numbers, emails and codes in them are fake examples.

| Screen | Built in |
|---|---|
| 01-login, 02-login-code | Prompt 2 (login code) |
| 14-email-button-page, 15-email-button-expired | Prompt 2 (the email button's /auth/confirm page) |
| 03-display-name, 13-settings | Prompt 3 (app shell and settings) |
| 12-nudges-empty, bottom tab bar on every screen | Prompt 3 |
| 04-join-from-link, 05-home-checklist, 06-class-link-qr | Prompt 4 (class link and checklist) |
| 07-new-target | Prompt 4 (templates only; the manual/auto choice is not built in phase 1) |
| 09-home-after-logging, 10-quick-log, 11-pod-progress | Prompt 5 (quick log, edit and delete) |
| 16-landing-desktop.dc.html (1440), 16-landing-mobile.dc.html (390), 17-privacy.dc.html | Prompt 6 (public landing page and privacy policy) |
| 08-notifications-PHASE2 | Prompt 10, as a one-time card on 声かけ (not a full screen); 13's 声かけの通知 switch too |

Phase 2 details that appear in the mockups but are NOT built in phase 1
(the ones marked "built" came in phase 2):
- 08 as a full screen, its sample showing the memo (notifications never show it), and its "also by email" line; the email switch in settings (13). There are no email nudges.
- milestone ticks at 25/50/75%, the passed-milestone dots, and the "あと○字" label (09, 11): built in Prompt 11
- "今週 +○字" and "今週記録した日" (09, 11): built in Prompt 11

The logged-in Home was redesigned in Prompt 11: `docs/mockups/phase2/home.html`
(390 and 1440, Japanese and English) is its design source.
- the "Google ドキュメントから自動" option (07)
Phase 1 keeps the existing progress bar and label for these.
