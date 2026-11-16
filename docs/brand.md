# Study Pods identity

The identity system of record. It holds every decision already in the app
plus the proposals the author accepted on 2026-11-16. The visual guide (a
private artifact, the author's) is at
https://claude.ai/artifact/2p4gyhA1diWfiSm3YxePVZ.

**What wins when they differ:** the code (`app/globals.css`,
`components/buttons.ts`, `docs/icons/sp-mark.svg`) and CLAUDE.md rule 11 win
over this file. Update this file in the same PR that changes any of them.

Contents:

1. Essence
2. Name
3. The mark
4. Lockup
5. Colour
6. Type
7. Layout and shape
8. Status shapes and icons
9. Motion
10. Voice and copy
11. Accessibility
12. Applications and asset inventory
13. Class poster
14. Changing the identity

---

## 1. Essence

**Peas in a pod: a small team, held together, each still their own.**

| | |
|---|---|
| **Category** | A group-project board for one university class: a shared project split into tasks with owners, live totals, check-ins and meeting polls. |
| **Audience** | Japanese university students (andrew.ac.jp), mostly on phones and often on the way to class; and the teacher who runs the class. |
| **Problem** | In group work, nobody knows who is doing what until the night before. Chat groups bury it, and asking feels like nagging. |
| **Promise** | The team finishes together. Everyone can see who is doing what and how far it has got, without chat, rankings or competition. |
| **Core metaphor** | A pea pod. Each pea is one student; the pod is the team of 2–6 that carries them to the end of the project. The name says it, the mark draws it, and the board is built around it. |
| **Personality** | Calm, plain-spoken and kind, like a thoughtful senpai, never a coach shouting. |
| **Values** | Togetherness without pressure. Honesty about who sees what. Almost no effort to log progress (automation first). |
| **Never** | Leaderboards, streak pressure, confetti, neon, guilt, or a colour as the only signal. Nor anything cut on purpose: open chat, gamification, matching with strangers. |

**Positioning line** (internal): for students in the same class doing a group
project, Study Pods is the team board that shows who is doing what, so the
work gets finished without anyone having to chase.

## 2. Name

- **Always "Study Pods":** two words, each capitalised, in English, in both
  languages. Not "StudyPods", "study pods", "SP" or スタディポッズ in UI copy.
- **In Japanese sentences:** keep a half-width space on each side when it
  touches Japanese text, as in 「Study Pods で書く」. It takes は／が／を
  directly: 「Study Pods は、…」.
- **Page titles:** `<page>｜Study Pods` in Japanese (full-width bar) and
  `<page> | Study Pods` in English.
- **Short name:** "sp" appears only as the mark's letters, never as a word.

## 3. The mark

The sp mark (2026-11-06) is a lower-case **s** and a **p** whose bowl is a
**pea**, set on a Hudson rounded square, the **pod**.

The master is `docs/icons/sp-mark.svg`. Every icon is rendered from it with
`node scripts/make-icons.mjs`. Never edit the PNGs by hand.

### Construction (100-unit grid)

| Part | Geometry | Fill |
|---|---|---|
| Pod | `rect` x 4, y 4, 92 × 92, corner radius 26 | Hudson `#ebdbd3` |
| s | Outfit Bold glyph outlined, `translate(22 60) scale(0.05 -0.05)` | Umbra `#1f1f1f` |
| p stem | `rect` x 51, y 35, 9 × 45, corner radius 4.5 | Umbra |
| Pea (p's bowl) | `circle` centre (67, 47), radius 12 | Umbra |

- **Letter box:** the letters fill x 22.5–79, y 35–80. They sit low on
  purpose, so the p's stem reads as a descender.
- **Stroke weight:** the stem's 9 units match the weight of the s, so the two
  letters read as one word.
- **The pea:** a full circle, not a letter bowl. It is the reason for the
  name, so never flatten it into a plain "p".

### Colourways

| Version | Pod | Letters | Use |
|---|---|---|---|
| **Primary** | Hudson `#ebdbd3` | Umbra `#1f1f1f` | App icons, favicon, the header, and everywhere by default |
| **On dark** | `#2c2c2e` | Porcelain `#f5f4f7` | The dark tab bar and side menu, and dark slides |
| **On colour** | White `#ffffff` | Umbra | A tinted or photographic ground, including a Hudson one (where the primary pod would vanish) |
| **Letters only** | none | Umbra (or white on dark) | One-colour print, stamps, embossing, and sizes below 24 px |

### Clear space

Keep **one pea's width** (24 units, a quarter of the mark's width) clear on
every side. At the 36 px header size that is 9 px, which the header's 10 px
gap to the wordmark already meets.

### Sizes

| Size | Where |
|---|---|
| 512 / 192 | Installed app icons (full bleed; the OS crops the shape) |
| 180 | Apple touch icon |
| 96 | Large in-page use (empty states, about) |
| 48 | Cards, the push notification icon |
| 36 | App header (`components/nav.tsx`) |
| 24 | Smallest size in the UI |
| 16 | Favicon; **absolute minimum** |

Below 24 px, use the letters-only mark on a Hudson ground. The favicon
renderer enlarges the letters to 1.18× for this reason.

### Don't

- **Stretch or squash it:** scale it only as a square.
- **Make it green:** green means "online" and nothing else.
- **Add effects:** no drop shadows, glows, gradients, outlines or bevels.
- **Rotate it:** the status stamp on a member card tilts, but the mark never
  does.
- **Re-letter, redraw or retype it:** use the SVG.
- **Put the primary pod on Hudson:** use the on-colour version.
- **Animate its parts apart:** the mark may fade in as a whole, nothing more.
- **Box it inside another shape:** the pod already is the container.

## 4. Lockup

The mark, then the wordmark, set horizontally.

- **Mark:** 36 px (`SpMark size={36}`).
- **Gap:** 10 px (`gap-2.5`).
- **Wordmark:** "Study Pods" in Outfit SemiBold (600), with tight tracking
  (`tracking-tight`, −0.025em). It is 18 px on phones (`text-lg`) and 20 px
  from 640 px (`sm:text-xl`). Ink is Umbra.
- **Vertical alignment:** the wordmark is centred on the mark.
- **Tap target:** at least 44 px tall (`min-h-11`).
- **On dark:** the on-dark mark with the wordmark in Porcelain `#f5f4f7`.
- **Scaling:** for display sizes, keep the ratio: the mark is 2× the
  wordmark's cap height and the gap is 0.28× the mark.
- **No stacked lockup.** If the space is square, use the mark alone.

## 5. Colour

Soft pastel, one ink, and every tint means one thing. Colour is never the only
signal: the same thing is always said in words.

### Core

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--page-bg` French Porcelain | `#f5f4f7` | Ground of every screen; also the manifest's theme and splash colour | Umbra on it 15.0:1 |
| `--surface` White | `#ffffff` | Cards, fields, the header | Umbra on it 16.5:1 |
| `--surface-container` | `#ebe9ee` | Quiet fills: fields, toggles, chips, offline member cards | |
| `--surface-container-highest` / `--border` | `#d9d6dd` | Hairlines, progress tracks, a switch track when off | |
| `--ink` / `--accent` Umbra | `#1f1f1f` | Text, filled buttons, links (underlined), tab bar, side menu | White on it 16.5:1 |
| `--muted` | `#4a4a4a` | Secondary text | 8.9:1 on white |
| `--outline` | `#6b6970` | Field outlines | 5.5:1 on white |
| `--error` | `#b3261e` | Errors only (the palette has no red) | 6.5:1 on white |

### The four tints (each means one thing)

| Token | Hex | Meaning | Umbra on it |
|---|---|---|---|
| `--tint-penna` Penna | `#bac8e0` | **Your own work**: your card, your next step, hints, the landing highlight | 9.8:1 |
| `--tint-hudson` Hudson | `#ebdbd3` | **Needs attention**: stuck, late, away; also the mark's pod | 12.2:1 |
| `--tint-rubble` Country Rubble | `#d0bea3` | **From the teacher**: announcements, class projects | 9.1:1 |
| `--tint-olive` Farmer's Market | `#8f917c` | **Done / on track** | 5.1:1 |

- **Cards:** a tinted card is `.rule-card.tint-*` and drops its hairline.
  Farmer's Market as a card is mixed 45% with white, so muted text on it stays
  above 4.5:1.
- **Status text:** `--status-active` `#4d4f39` (done / on track) and
  `--status-stale` `#4e4d52` are 8.4:1 on white and at least 4.6:1 on every
  tint.

### Online (the one exception)

| Token | Hex | Use |
|---|---|---|
| `--online` | `#16a34a` | The online dot, inside a white ring (3.3:1 as a non-text mark) |
| `--online-strong` | `#15803d` | The word オンライン, and the solid pill under white text (5.0:1) |

It means only "online, here right now" (the author's choice of 2026-11-16).
It appears only as the dot, the pill and the word, including the mark at the
top of a member's card while that member is online. Never use it for success,
done, confirm or anything else: done is Farmer's Market.

### Member tints

On the board, an online member's cards borrow a tint to tell people apart
(`tintOf()` in `lib/team-status.ts`):

- **You:** always Penna.
- **Teammates:** Hudson, Country Rubble, then Farmer's Market, in join order,
  repeating from a fourth teammate.
- **Offline members:** their cards stay white.

There a tint means "this person", while the green dot and the word オンライン
say the state.

### How much of each

These proportions guide new screens and printed material; they are not a rule
to measure.

| Colour | Share of a screen |
|---|---|
| Porcelain and white | About two-thirds. They carry the screen. |
| Umbra | About a sixth. It carries the words and actions. |
| The four tints | Small: a few cards per screen, at most one tint per card. |
| Online green | Tiny: only ever a dot, a pill or a word. |

### Never

- **New hex values:** don't hard-code one; add a token first.
- **Gradients:** none, except the landing's flat highlight bar, which is a
  single tint.
- **Pure black text:** use Umbra.
- **Translucent text:** only `--muted`.

## 6. Type

### Faces

- **Latin and numbers:** Outfit, through `next/font`, at weights 300, 400,
  600 and 700.
- **Japanese:** the system font, falling back in this order: Hiragino Sans,
  Hiragino Kaku Gothic ProN, Noto Sans CJK JP, Noto Sans JP, Yu Gothic UI,
  Meiryo.
- **No downloaded Japanese font:** one broke CI builds.
- **One stack for all three roles:** heading, body and meta all use the same
  stack. Outfit sets the Latin, and Japanese characters fall through to the
  system face.

### Scale

| Role | Size | Weight | Line | Notes |
|---|---|---|---|---|
| Display (landing hero) | 31 px phones, 50 px wide | 700 | 1.45–1.5 | Last line gets the Penna highlight |
| Page title | 28–36 px | 300 kicker line + 700 main line | 1.3 | e.g. チームの / **最終発表** |
| Section heading | 17 px | 700 | 28 px | 次の打ち合わせ |
| Body | 15 px | 400 | 28 px (1.8 in Japanese) | |
| Button | 15 px | 600 | — | Never wraps (`whitespace-nowrap`) |
| Meta | 13 px | 400 | 1.8 | Muted: dates, counts |
| Kicker / eyebrow | 12 px | 700 | — | +4% tracking, muted |
| Field text | ≥ 16 px | 400 | — | iOS zooms below 16 |

### Japanese typesetting

- **Wrapping:** `word-break: auto-phrase` on `:lang(ja)`, so lines break
  between phrases.
- **Leading:** 1.8 for xs, sm and base body sizes. Headings keep tighter
  leading.
- **Punctuation:** full-width (、。「」（）！？). Latin and numbers stay
  half-width. Japanese has no space between characters.
- **Numbers:** tabular figures wherever numbers line up (totals, times).

## 7. Layout and shape

### Rhythm

- **The unit:** 28 px (`--rule`). Text on the page uses 28 px lines, and gaps
  are multiples of 28 (or 14).
- **Side gutter:** 16 px on phones.

### Breakpoints

| Width | Change |
|---|---|
| Below 640 px | Phone: floating tab bar, folded チームのいま |
| 640 px | Lockup text grows, チームのいま cards always show, the quick-log sheet becomes a centred dialog |
| 768 px | Dark side menu replaces the tab bar; the board gains its right-hand column (check-in, meeting, Google, team); the poll table view |

### Shapes

| Element | Spec |
|---|---|
| Card | `.rule-card`: 20 px radius, 20 px padding, white, hairline `inset 0 0 0 1px rgba(31,31,31,.06)` |
| Primary button | Filled Umbra pill, 48 px tall, 24 px side padding, 15 px/600 white text. On hover, a soft shadow and brightness 1.25. On press, it moves down 2 px. |
| Secondary button | White pill, 2 px Umbra inset outline, 48 px. On hover, it fills with `--surface-container`. |
| Field | `rounded-lg`, `--outline` border, at least 16 px text, a visible label above, errors below linked with `aria-describedby` |
| Tab bar (phones) | Umbra, 28 px radius, floating 12 px from the edges plus the safe area |
| Side menu (≥ 768) | Umbra, 28 px radius, 96 px wide, sticky 16 px from the top |
| Chips / pills | Fully rounded |
| Focus ring | 3 px solid Umbra, 3 px offset, everywhere |

**One filled button per screen area:** a second action is the outlined pill
or a link.

## 8. Status shapes and icons

A member's state is always a **shape plus words**, never colour alone
(`StatusDot`, `lib/team-status.ts`):

| State | Shape | Words |
|---|---|---|
| Online | Filled green dot in a white ring, a soft pulse | オンライン |
| Opened today | Thick ring | 今日開きました（いまはオフライン） |
| Away | Dashed ring, Hudson card | ○日までお休み |
| Offline | Thin ring | Last day opened |
| Never opened | none | まだ開いていません |

- **Stamps:** the tilted status stamp ("stamps down" with a 0.5 s overshoot)
  marks a task's state. It may tilt; the mark may not.
- **Icons:** simple line icons drawn in `currentColor`, never emoji as icons.
  A pen pill marks 「Study Pods で書く」. Google file kinds show their own
  file-type icon beside the file's name.

## 9. Motion

Quiet, short and purposeful. Under `prefers-reduced-motion: reduce`, nothing
moves: switches are instant, and a highlight's resting state is simply drawn.

| Moment | Spec |
|---|---|
| Page change | Fade: out 120 ms ease-out, in 180 ms ease-out (React `<ViewTransition>`) |
| Bottom-tab change | Slide in the tab's direction with a fade: out 150 ms ease-in, in 200 ms ease-out. The header, tab bar and sticky ＋記録 stay still. |
| Quick-log sheet | Slides up 300 ms with `cubic-bezier(0.32, 0.72, 0, 1)`; from 640 px it fades and scales from 0.96 instead |
| Toast | Opacity 200 ms |
| Status stamp | 0.5 s, from 2.2× to 1×, `cubic-bezier(0.2, 1.4, 0.4, 1)` |
| Milestone (25/50/75/100%) | One soft swell to 1.18×, 450 ms, after a 500 ms delay |
| Progress bar | scaleX 0.4 s ease |
| Online dot | Green pulse ring to 6 px, 2.2 s, repeating |
| Online member card | Glow breathing 10 ↔ 22 px, 2.8 s, repeating |
| Landing opening | The demo board rises 40 px and scales from 0.94, with a slight overshoot and a landing shadow, 1.1 s at a 0.55 s delay. Then the Penna highlight sweeps under the last headline line, 0.9 s at a 1.35 s delay. |
| Landing demo | One 17.5 s loop of five 3.5 s scenes, all CSS |
| Card link press | Dips, 0.1 s |

Never: bounce loops, parallax, confetti, motion on the mark, or anything that
delays a tap.

## 10. Voice and copy

### Principles

1. **Say what the button does,** naming the action and its object:
   招待を送る, チーム名を保存, このチームを抜ける.
2. **Say who will see it,** next to the thing, in plain words.
3. **Polite です・ます** in Japanese, warm but never cute. English is plain
   and friendly, in sentence case.
4. **Specific over generic:** no 送信, Submit, OK or Get started where a
   specific label fits.
5. **No ranking, guilt or exclamation pressure.** Encourage the team, never
   compare people.
6. **Lock screens are public:** a push names who did something, or the
   owner's own task. It never names a poll title, memo, number, class or
   announcement text.
7. **Placeholders start with 例： / e.g.** and are never the label.
8. **Errors say what to do next,** under the field.

### Say / not

| Say | Not | Why |
|---|---|---|
| 招待を送る | 送信 | Names the action and its object |
| 記録に書いたメモは、あなたにだけ見えます。 | データは安全に管理されています。 | Privacy in plain words, by the thing it's about |
| ○○さんが打ち合わせの日程調整を始めました | (the poll's title on a lock screen) | Names who, not the private detail |
| 「発表原稿」の締切は明日です | 締切が迫っています！急いで！ | Calm and specific, to the owner only |
| (nothing) | あなたはチームで最下位です！ | No ranking, no guilt |

### Glossary

| Japanese | English | Meaning |
|---|---|---|
| クラス | class | A course; joined with a class code |
| チーム | team | A pod of 2–6 students in one class (the code still says `pairings`) |
| プロジェクト | project | The team's shared group assignment |
| タスク | task | A piece of the project with one owner |
| ボード | board | The team's project page |
| ＋記録 | Log | Adding progress by hand |
| チェックイン | check-in | A member's snapshot shared every few days |
| 打ち合わせ | meeting | A live meeting, scheduled by a poll |
| 日程調整 | meeting poll | Picking a meeting time |
| 声かけ | nudge | A one-tap "thinking of you" to a teammate |
| お知らせ | announcement | A message from the teacher |
| お休み | away | A break, until a date |
| オンライン | online | Here right now |
| 困っています | stuck | A task's owner asking for help |

### Copy bank (live, in `messages/*.json`)

**Landing hero (`landing.hero`)**

- **Eyebrow:** グループ課題のための、チームの進捗ボード / *A progress board
  for group assignments*
- **Headline:** グループ課題を、／チームで分けて、／**最後まで終わらせる。**
  / *Split your group project, / share the work, / **and finish it
  together.***
- **Body:** 「…誰が何を担当して、どこまで進んだかがひと目でわかります。
  ランキングも、競争もありません。」 / *Everyone sees who is doing what and
  how far it has got. No rankings, no competition.*
- **Call to action:** 大学のメールでログイン / *Log in with your university
  email*

**Metadata:** 同じ授業の仲間と、いっしょに進める小さな学習チームです。 /
*Small study teams for your course: keep going, together with your
classmates.*

**Pushes:** the title is always "Study Pods". The bodies come from
`messages` `push.*`, and `supabase/functions/_shared/push-text.ts` holds a
copy that a test keeps in step.

## 11. Accessibility

- **Contrast:** text at least 4.5:1 and non-text marks at least 3:1 on every
  surface they appear on, tints included (all tokens above pass).
- **Colour alone:** never the only signal: every state has words and a shape.
- **Touch targets:** at least 44 px; buttons are 48 px.
- **Keyboard:** the visible focus ring everywhere, a 本文へ移動 skip link,
  and `scroll-padding` so focus isn't hidden under the tab bar (WCAG 2.2,
  2.4.11).
- **Motion:** reduced motion is respected everywhere (section 9).
- **Language:** `lang` is set per locale, so Japanese typesetting rules apply.
- **Checks:** `node scripts/axe-public.mjs` covers the public pages; the
  author checks signed-in pages in Chrome DevTools.

## 12. Applications and asset inventory

| Asset | File(s) | Spec |
|---|---|---|
| Master mark | `docs/icons/sp-mark.svg` | 100 × 100 viewBox |
| Installed app icons | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Full-bleed Hudson square, letters at 1.1×, inside the maskable safe circle (radius 40) |
| Apple touch icon | `app/apple-icon.png`, `public/apple-touch-icon.png`, `public/apple-touch-icon-precomposed.png` | 180 px, same art |
| Favicons | `app/favicon.ico` (16/32/48), `app/icon1.png` (32), `app/icon2.png` (192) | Tab: rounded tile (corner radius 22), letters at 1.18× |
| Header lockup | `components/brand-mark.tsx`, `components/nav.tsx` | Section 4 |
| Link preview | `docs/og-image/og-image.html` → `app/opengraph-image.png` | Porcelain, lockup, hero headline with the Penna highlight; keep in step with the landing hero |
| Web app manifest | `app/manifest.ts` | Name "Study Pods", theme and background `#f5f4f7`, single theme |
| Push notification | `public/sw.js`, `send-nudge-push` | Title "Study Pods", app icon, a lock-screen-safe body |
| Offline page | `public/offline.html` | Static, bilingual, no cached personal data |
| Landing | `components/landing/` | Hero, demo loop, FAQ; tokens only, no hex |
| Visual guide | https://claude.ai/artifact/2p4gyhA1diWfiSm3YxePVZ | The whole system at a glance |

After `node scripts/make-icons.mjs`, bump `VERSION` in `public/sw.js`.

## 13. Class poster (accepted, not built)

For the classroom wall or a lecture slide, so students can join on the spot.

- **Format:** A4 portrait (210 × 297 mm), also exported as a 16:9 slide.
- **Ground:** Country Rubble `#d0bea3`, because it comes from the teacher. The
  content sits on a white card.
- **Order from top:**
  1. The lockup.
  2. The class name, large.
  3. 「〈クラス名〉のチームに参加しよう」.
  4. The class join QR code (at least 40 mm, with a white quiet zone).
  5. The class code in large tabular letters.
  6. 「授業のQRを読み取るか、コードを入力してください。」
- **Rules:**
  - The QR code is the class join link, not a team invite.
  - No student names.
  - Japanese first, with English below in smaller type.
- **Where it would live:** a print view beside the class join QR on the
  organizer's class page.

## 14. Changing the identity

- **The mark:** change only `docs/icons/sp-mark.svg`, then rerun the icon
  script and bump the service worker version.
- **New colours:** add a token in `app/globals.css` with its contrast in a
  comment, then add it to section 5. A new colour needs a single meaning.
- **Copy:** change both `messages/ja.json` and `messages/en.json`. Push copy
  also changes in `push-text.ts`.
- **Decisions of record:** log any real change of direction in Notion, as
  for any architectural choice.
- **This file:** the mark is a design decision, not the result of a
  trademark search.
