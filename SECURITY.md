# Security Model

This app handles student identity and academic progress. Not credit cards — but a leak here means a student's coursework struggles are visible to strangers, which is exactly the trust this product is built on. Treat it seriously.

This document doubles as source material for the security section of the final report.

---

## 1. Threat model — what we're actually defending against

Ranked by *likelihood × damage*, not by how dramatic they sound.

| # | Threat | Why it matters here | Mitigation |
|---|---|---|---|
| 1 | **Broken authorization** — user A reads user B's progress when they aren't podmates | This is *the* risk. The entire product is scoped visibility. A bug here breaks the core promise. | Postgres **Row Level Security** (§2) |
| 2 | **Leaked secrets** — API keys committed to the repo | Anyone with the Supabase service key bypasses every rule below | `.env` gitignored; secret scanning in CI; keys only in Vercel/GitHub env |
| 3 | **Over-broad Google OAuth scope** — app can read a user's entire Drive | We only need *one* doc's word count. Asking for full Drive access is both a privacy violation and an enormous blast radius if we're breached | Request `drive.file` scope only (§3) |
| 4 | **Account takeover** | Attacker sees someone's academic progress; poses as a podmate | Magic-link auth (no passwords to steal), short session expiry |
| 5 | **Fake enrollment** — a non-student joins a class | Trust-based for MVP; a known, *accepted* limitation | University email domain check; documented as a limitation |
| 6 | **Abuse via the nudge field** — harassment through the one free-text input | It's the only user-to-user text channel; it *will* be the abuse vector if there is one | Length cap, rate limit, report/block, no rich content |
| 7 | XSS / injection | Standard web risks | React escapes by default; parameterized queries only; no `dangerouslySetInnerHTML` |

**Explicitly not defended against:** a determined attacker with a valid university email who joins a class they aren't in. MVP enrollment verification is trust-based. Say this out loud in the report — a stated, reasoned limitation is a strength; a silent gap is a failure.

---

## 2. Authorization: Row Level Security is the whole ballgame

**Principle: the database is the last line of defense, so it must also be the first.**

Do not rely on the frontend hiding things, and do not rely on API routes remembering to check. Both are one forgotten `if` away from a leak. RLS policies live in Postgres and apply to *every* query, from any client, forever.

Every table gets RLS **enabled** and a policy. The core rule:

```sql
-- Enable RLS on every table. A table without RLS enabled is WIDE OPEN.
alter table progress_logs enable row level security;

-- A user can read a progress log only if the log's author is in one of their pods.
create policy "read podmates progress"
on progress_logs for select
using (
  exists (
    select 1
    from pairing_members me
    join pairing_members them on them.pairing_id = me.pairing_id
    where me.user_id = auth.uid()
      and them.user_id = progress_logs.user_id
  )
);

-- A user can only write their own logs.
create policy "insert own progress"
on progress_logs for insert
with check (user_id = auth.uid());
```

### The footgun, stated plainly

**Forgetting `enable row level security` on a table leaves it completely public**, and everything still *looks* correct while you're testing as yourself. This is the single most common Supabase mistake.

Two non-negotiable habits:
1. **Every migration that creates a table must enable RLS in the same migration.** No exceptions.
2. **Test authorization as a second user, always.** "It works for me" proves nothing about isolation. Log in as User B and confirm you *cannot* see User A's data.

The `service_role` key bypasses RLS entirely. It must never reach the browser — server-side only, and ideally not used at all in MVP.

---

## 3. Google Docs integration — least privilege

The auto-tracking feature needs *one* number: word count of *one* doc.

- Request the **`drive.file`** scope — access limited to files the user explicitly picks — **not** `drive.readonly`, which would grant us their entire Drive.
- Store refresh tokens **encrypted at rest**, server-side only.
- Show the user, in plain language, exactly what we can see before they connect. This is Design Principle 4 (transparency) from the PRD, applied.
- Provide a one-click disconnect that actually revokes the token.

If the scope decision changes, it goes in the Notion Decision Log with the reasoning.

---

## 4. Secrets

- `.env.local` is gitignored. Never commit it.
- Real secrets live in **Vercel env vars** and **GitHub Actions secrets**.
- `.env.example` lists variable *names* only — never values.
- If a key is ever pushed: **rotate it immediately.** Deleting the commit is not enough; assume it's compromised.

---

## 5. Input handling

- Nudge / "stuck on" text: hard length cap (e.g. 280 chars), rate-limited, plain text only.
- All DB access through the Supabase client (parameterized). No hand-built SQL strings.
- Never `dangerouslySetInnerHTML`.

---

## 6. Pre-launch checklist (before the pilot)

- [ ] RLS **enabled** on every single table — verify with a query, don't assume
- [ ] Every table has an explicit SELECT policy and an explicit INSERT/UPDATE policy
- [ ] Tested as a second, unrelated user: cannot see their data
- [ ] Tested as a logged-out user: cannot read anything
- [ ] `service_role` key does not appear anywhere in client-side code
- [ ] Google OAuth scope is `drive.file`, verified in the consent screen
- [ ] No secrets in git history (`git log -p | grep -i key`)
- [ ] Nudge input length-capped and rate-limited
- [ ] Privacy note shown to pilot users explaining what is stored and who can see it
