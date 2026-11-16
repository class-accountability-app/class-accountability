# Study Pods brand

The identity system of record: the decisions in the app, plus the proposals
the author accepted on 2026-11-16. Visual guide (private, the author's):
https://claude.ai/artifact/2p4gyhA1diWfiSm3YxePVZ.

Tokens live in `app/globals.css`, and CLAUDE.md rule 11 governs how the UI
uses them. This file covers the brand around them. Where the two differ, the
code and rule 11 win, and this file is updated to match.

## Essence

**Peas in a pod: a small team, held together, each still their own.**

- **Category:** a group-project board for one class: tasks with owners, live
  totals, check-ins and meeting polls.
- **Audience:** Japanese university students, mostly on phones, and the
  teacher who runs the class.
- **Promise:** the team finishes together. Everyone can see who is doing what
  and how far it has got, without chat, rankings or competition.
- **Core metaphor:** a pea pod. Each pea is one student; the pod is the team
  (2–6) that carries them to the end of the project. The name says it, the
  mark draws it, and the board is built around it.
- **Personality:** calm, plain-spoken and kind. Polite です・ます in Japanese.
  Honest about who sees what.
- **Never:** leaderboards, streak pressure, confetti, neon or guilt, and never
  a colour as the only signal.

## The mark

The sp mark (2026-11-06) is a lower-case s, and a p whose bowl is a pea, on a
Hudson rounded square. The source is `docs/icons/sp-mark.svg`, and every icon
is rendered from it by `node scripts/make-icons.mjs`. Never edit the PNGs by
hand.

Construction on a 100-unit grid:

- **Pod:** a 92-unit square at (4, 4) with a corner radius of 26, in Hudson
  `#ebdbd3`.
- **s:** Outfit Bold, outlined, in Umbra `#1f1f1f`, the same voice as the
  wordmark and the UI.
- **p stem:** a 9 × 45 rounded bar at (51, 35) that sits low like a descender.
- **Pea:** the p's bowl is a full circle, radius 12, centred at (67, 47).

### Colourways

| Version | Pod | Letters | Use |
|---|---|---|---|
| Primary | Hudson `#ebdbd3` | Umbra `#1f1f1f` | App icons, favicon, header, everywhere by default |
| On dark | `#2c2c2e` | Porcelain `#f5f4f7` | The dark tab bar and side menu |
| On colour | White `#ffffff` | Umbra | On a tinted or photographic ground, including a Hudson one |
| Letters only | none | Umbra | One-colour print, stamps, and sizes below 24 px |

### Clear space and size

- **Clear space:** keep one pea's width (24 units, a quarter of the mark)
  clear on every side.
- **Minimum size:** 16 px. Below 24 px, use the letters-only mark on a Hudson
  ground.
- **Usual sizes:** 96 for the app icon, 48 on cards, 36 in the header, 24 as
  the smallest UI size, and 16 for the favicon.

### Don't

- **Stretch or squash it:** scale it only as a square.
- **Make it green:** green means "online" and nothing else.
- **Add effects:** no shadows, glows, gradients or outlines.
- **Rotate it:** the status stamp on a member card tilts; the mark never does.
- **Redraw or re-letter it:** use the SVG.

## Lockup

The mark at 36 px, a 10 px gap, then "Study Pods" in Outfit SemiBold with
slightly tight tracking (`components/nav.tsx`). The name is always the English
"Study Pods", in both languages.

On dark (the tab bar and side menu), use the on-dark mark with the name in
Porcelain.

## Colour

Soft pastel, one ink, and every tint means one thing. Colour is never the only
signal: the same thing is always said in words.

| Token | Hex | Role | Contrast with Umbra |
|---|---|---|---|
| French Porcelain `--page-bg` | `#f5f4f7` | Ground of every screen | 15.0:1 |
| White `--surface` | `#ffffff` | Cards, fields, header | 16.5:1 |
| Umbra `--ink` | `#1f1f1f` | Text, filled buttons, links, tab bar | — |
| Penna `--tint-penna` | `#bac8e0` | Your own work | 9.8:1 |
| Hudson `--tint-hudson` | `#ebdbd3` | Needs attention; the mark's pod | 12.2:1 |
| Country Rubble `--tint-rubble` | `#d0bea3` | From the teacher | 9.1:1 |
| Farmer's Market `--tint-olive` | `#8f917c` | Done / on track (text form `--status-active` `#4d4f39`) | 5.1:1 |
| Online `--online` / `--online-strong` | `#16a34a` / `#15803d` | Only "online, here right now" (white text on strong: 5.0:1) | — |

On the board, an online teammate's card borrows a tint to tell people apart:
yours is Penna, and teammates take Hudson, Rubble and Farmer's Market in join
order. There the tint means "this person", while the green dot and the word
オンライン say the state.

### How much of each

These proportions guide new screens and printed material; they are not a rule
to measure.

- **Porcelain and white:** about two-thirds. They carry the screen.
- **Umbra:** about a sixth. It carries the words and actions.
- **The four tints:** small, a few cards per screen.
- **Online green:** tiny, only ever a dot, a pill or a word.

## Type

- **Fonts:** Outfit (next/font) for Latin letters and numbers. For Japanese,
  the system font: Hiragino Sans on Apple devices and Noto Sans CJK on
  Android. A downloaded Japanese font broke CI builds, so there is none.
- **Page title:** 28–36 px, a light kicker over a bold line.
- **Section heading:** 17 px bold.
- **Body:** 15 px, on 28 px lines.
- **Meta:** 13 px, muted.
- **Kicker:** 12 px bold with +4% tracking.
- **Fields:** at least 16 px, with a visible label.

## Shape, rhythm and motion

- **Buttons:** pills 48 px tall, either filled Umbra or white with an Umbra
  outline. One filled button per screen area.
- **Shapes:** fields are `rounded-lg`. Cards have 20 px corners and 20 px
  padding.
- **Navigation:** the dark floating tab bar on phones, and the dark side menu
  from 768 px.
- **Rhythm:** 28 px lines, with gaps in multiples of 28.
- **Motion:** a fade between pages, a slide between tabs, a soft pulse on the
  online dot, and one opening moment on the landing page. Under reduced
  motion, nothing moves.

## Voice

Say what the button does, and say who will see it.

| Say | Not | Why |
|---|---|---|
| 招待を送る | 送信 | A button names its action and its object. |
| 記録に書いたメモは、あなたにだけ見えます。 | データは安全に管理されています。 | State privacy in plain words, next to the thing it's about. |
| ○○さんが打ち合わせの日程調整を始めました | (the poll's title on a lock screen) | A push names who did it, never the private detail. |
| (nothing) | あなたはチームで最下位です！ | No ranking, no guilt, no exclamation pressure. |

A placeholder starts with 例： and is never the label. Japanese uses です・ます.
Every string lives in `messages/ja.json` and `messages/en.json`.

## Applications

| Where | Status | Notes |
|---|---|---|
| Home-screen icon | Live | PWA icons, rendered from the SVG |
| Push notifications | Live | The mark is the sender; the words carry the meaning |
| Team board member card | Live | Tinted while online, with the green dot and the オンライン pill |
| Browser tab | Live | Favicon at 16/32/48 px |
| Link preview | Live | `docs/og-image/og-image.html` → `app/opengraph-image.png`; keep it in step with the landing hero |
| Class poster | Accepted, not built | A4 for the classroom wall or a slide: lockup, class name, the class join QR and code, on Country Rubble (it comes from the teacher). Copy: 「〈クラス名〉のチームに参加しよう」 and 「授業のQRを読み取るか、コードを入力してください。」 |

## Note

The mark is a design decision, not the result of a trademark search.
