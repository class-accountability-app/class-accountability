# Class-Scoped Accountability App

> See that someone else in your class is making progress too — without ever having to talk to them.

A class-scoped accountability app for university students. Students in the same class are auto-paired into pods of 3 and can passively see each other's progress. No chat, no coordination, no social overhead.

**Semester capstone project.** Build window: 14 Jul – 28 Aug 2026 (7 one-week sprints).
Planning, sprints, and the decision log live in Notion. Code and code-level issues live here.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | One repo for frontend + API. TypeScript catches a whole class of bugs before runtime. |
| Database | **Postgres (Supabase)** | Relational data (users ↔ classes ↔ pods ↔ logs) is a natural fit. |
| Auth | **Supabase Auth** (email magic link) | No passwords to store, hash, or leak. |
| Authorization | **Postgres Row Level Security (RLS)** | Access rules enforced *in the database*, not just in app code. See [SECURITY.md](./SECURITY.md). |
| Hosting | **Vercel** | Zero-config for Next.js; free tier is enough. |
| CI | **GitHub Actions** | Lint, typecheck, build, test on every PR. |

---

## Local setup

```bash
git clone https://github.com/<ORG>/<REPO>.git
cd <REPO>
npm install
cp .env.example .env.local   # then fill in your own values
npm run dev
```

Open http://localhost:3000

> **Never commit `.env.local`.** It is gitignored. Secrets go in Vercel/GitHub environment settings, never in the repo.

---

## Project structure

```
/app              Next.js App Router (pages + API routes)
/components       Reusable UI
/lib              Supabase client, helpers, projections
/supabase
  /migrations     SQL schema + RLS policies (version-controlled)
/docs             Architecture notes, ADR pointers
/.github          CI, PR/issue templates
```

---

## Data model (v0.1)

`User` · `Class` · `ClassMembership` · `Pairing` (pod of 3) · `Target` · `ProgressLog` · `Nudge`

Full definitions in Notion → **Data Model (v0.1)**. Schema changes go through `/supabase/migrations`, never by clicking around in the Supabase dashboard — otherwise the schema exists only in someone's browser history.

---

## Workflow

Branch → commit → PR → review → merge. See [CONTRIBUTING.md](./CONTRIBUTING.md).

`main` is protected. Nobody pushes to it directly, including you.

---

## Scope

**MVP:** auth, create/join class, auto-pairing into pods of 3, targets + deadlines, manual progress logging, shared pod view, Google Docs auto-tracking (bonus), "stuck on" nudge, churn detection (display-only).

**Explicitly out of scope:** peer report feedback, cross-university stranger matching, open chat, gamification. These are future work — deliberately, not accidentally. Reasoning is in the Notion Decision Log.
