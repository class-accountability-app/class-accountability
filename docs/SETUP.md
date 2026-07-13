# Sprint 0 Setup Checklist

Do these in order. Roughly 60–90 minutes total, mostly waiting on installs.

---

## 1. GitHub Organization (~5 min)

1. github.com → **+** → **New organization** → **Free** plan.
2. Name it something project-ish (`class-accountability`, not your username).
3. Invite your 1–2 teammates as **Members**.
4. Make yourself and one teammate **Owners** — if one person is unreachable in week 5, you don't want the org locked.

> **Why an org, not a personal repo:** teammates get real access, Notion's PR→task auto-update *requires* an org connection, and it separates project work from your personal account.

---

## 2. Create the repo (~5 min)

1. In the org → **New repository**.
2. Name it, set **Private**.
3. Do *not* initialize with a README — you're about to push one.

```bash
npx create-next-app@latest class-accountability --typescript --app --eslint
cd class-accountability
# copy in the scaffold files (README, SECURITY, CONTRIBUTING, .github/, .gitignore, .env.example)
git init
git add .
git commit -m "chore: initial scaffold, CI, and security model"
git branch -M main
git remote add origin https://github.com/<ORG>/class-accountability.git
git push -u origin main
```

Then edit `.github/CODEOWNERS` — replace `@TEAMMATE_1` / `@TEAMMATE_2` with real GitHub usernames.

---

## 3. Branch protection on `main` (~5 min)

Repo → **Settings** → **Rules** → **Rulesets** → **New branch ruleset**. Target `main`. Enable:

- [x] **Require a pull request before merging** → 1 approval
- [x] **Dismiss stale approvals when new commits are pushed**
- [x] **Require status checks to pass** → add `quality` and `security` (they'll appear after CI runs once)
- [x] **Require branches to be up to date before merging**
- [x] **Block force pushes**
- [x] **Require conversation resolution before merging**

Leave "Require signed commits" **off** — it's real friction for a student team and buys you nothing here.

> On a 2-person team, "1 approval" means you cannot merge your own PR. That's the point. It's also the single cheapest defense against the RLS mistakes in SECURITY.md.

---

## 4. Enable GitHub's free security tools (~2 min)

Repo → **Settings** → **Code security**. Turn on:

- [x] **Dependabot alerts** — tells you when a dependency has a known CVE
- [x] **Dependabot security updates** — auto-opens PRs to fix them
- [x] **Secret scanning** + **Push protection** — blocks a commit that contains an API key *before* it lands

Push protection is the one that will actually save you. Someone will paste a key into a file at some point.

---

## 5. Supabase (~15 min)

1. supabase.com → new project (free tier). Region: closest to your users.
2. Copy the URL and **anon** key into `.env.local`.
3. Copy the **service_role** key somewhere safe — server-side only, never in the browser, never in git.
4. Create `/supabase/migrations/0001_init.sql`. **Every table gets `enable row level security` in the same file.** CI will fail the PR if you forget — that check exists because this is the #1 way this app could leak.

---

## 6. Vercel (~10 min)

1. vercel.com → import the GitHub repo.
2. Add env vars from `.env.example` (real values this time).
3. Every PR now gets a preview deployment automatically — genuinely useful for showing your pod view to a teammate without them running anything locally.

---

## 7. Connect Notion ↔ GitHub (~10 min)

**Requirement:** you must be both a **Notion workspace owner** and a **GitHub org admin**. (This is why step 1 was an org.)

1. Notion → **Settings** → **Connections** → find **GitHub (Workspace)** → **Connect** → authorize.
2. Open the Notion **Tasks** database → **+** to add a property → choose **GitHub Pull Requests**.
3. Click the new property → **Edit property** → find **Auto-update**.
4. Map PR state → task Status:

| GitHub PR state | Notion task status |
|---|---|
| Opened | In progress |
| Review requested | In review |
| Approved | In review |
| Merged | Done |

Now your Notion board moves itself when you actually ship code. Optionally turn on **Activity Comments** to see PR activity inside the task.

> Note: your Tasks database currently has statuses *Not started / In progress / Done*. If you want the **In review** step, add that status option first, then do the mapping.

---

## 8. Final Sprint 0 checks

- [ ] Every teammate can clone, install, and run `npm run dev`
- [ ] A test PR gets blocked from merging without approval (confirm the ruleset actually works — don't assume)
- [ ] CI runs green on that test PR
- [ ] Merging that PR flips the linked Notion task to **Done** automatically
- [ ] `.env.local` is *not* in `git status`

That last one: if you can see `.env.local` in `git status`, stop and fix `.gitignore` before doing anything else.
