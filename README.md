# Pricele

A daily price-guessing game. Every day players get three real-world prices to estimate — easy, medium and hard — with one official guess each, up to 1,000 points per question (3,000 per day), streaks, leaderboards, an archive with practice mode, and an admin dashboard for sourcing, verifying and publishing questions.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres + Auth) · Zod · Vitest · Playwright.

---

## Contents

1. [Status at a glance](#status-at-a-glance)
2. [Architecture](#architecture)
3. [Run it locally](#run-it-locally)
4. [Set up Supabase](#set-up-supabase)
5. [Authentication (email + Google)](#authentication)
6. [Create the first administrator](#create-the-first-administrator)
7. [Add and publish daily questions](#add-and-publish-daily-questions)
8. [Tests](#tests)
9. [Deploy](#deploy)
10. [Game rules as implemented](#game-rules-as-implemented)
11. [Security model](#security-model)
12. [Configuration reference](#configuration-reference)
13. [Known limitations and remaining work](#known-limitations-and-remaining-work)

---

## Status at a glance

| Area | State |
| --- | --- |
| Database schema, RLS, privileged functions | Implemented; 52 integration tests against real PostgreSQL 16 |
| Scoring, money parsing, dates, share text | Implemented; 48 unit tests |
| Daily gameplay, guest sessions, results, resume | Implemented; covered end to end in a browser |
| Accounts, profiles, guest claiming | Implemented; E2E-tested against a **test stand-in** for Supabase Auth (see limitations) |
| Archive + practice, leaderboards, streaks | Implemented and tested |
| Admin dashboard (questions, sources, sets, corrections, users, audit) | Implemented; E2E-tested |
| Lint, typecheck, production build | Passing |
| Deployment | **Not performed** — instructions below |
| Real question content | 15 starter questions on familiar items, each with a picture; unverified until an editor checks them |

---

## Architecture

```
Browser ──► Next.js (Vercel)
              │  Server Components + Server Actions (all game logic entry points)
              │
              ├─► Supabase Auth  (sign-in, sessions via @supabase/ssr cookies)
              │
              └─► Postgres as role `pricele_app` (DATABASE_URL, server-only)
                    └─ may only EXECUTE functions in the private `pricele` schema
                       (SECURITY DEFINER, empty search_path, transactional)
```

Key decisions:

- **All authoritative logic lives in Postgres functions** (`supabase/migrations/*003_game_functions.sql`, `*004_admin_functions.sql`). Submitting a guess, scoring, completion, claiming, leaderboards, streaks, publication and corrections each run as one transaction. The server passes a verified identity (Supabase user id, or the SHA-256 hash of the guest cookie) — never values from the request body.
- **Least privilege.** The web server connects as `pricele_app`, which has *no* table privileges at all — only `EXECUTE` on the API functions. The Supabase service-role key is not used by the app. Admin role grants are impossible through the app; they require the database owner (see bootstrap).
- **Answer keys are a separate table** (`question_answers`) with RLS on and no grants for `anon`/`authenticated`. Answers are only returned inside the payload of an attempt that already exists (or for archive dates in the past).
- **Exact money.** Amounts are `NUMERIC(20,2)` (max $1,000,000,000,000,000). Scores are computed with Postgres `NUMERIC` `ln()`. A TypeScript mirror (`lib/scoring`, using decimal.js) exists for previews and is parity-tested against SQL on 300+ value pairs.
- **Dates.** The database decides "today" with `America/New_York` (`pricele.current_game_date()`); timestamps are stored in UTC. DST is handled by the tz database.
- **No caching of personalized or answer-bearing pages.** `cacheComponents` is disabled; game, results, profile and admin routes send `Cache-Control: private, no-store`.
- **Rate limiting** uses a shared Postgres fixed-window counter (`pricele.rate_limit`), so it works across serverless instances without extra infrastructure. IPs are hashed before use.

Project layout:

```
app/                 routes (pages, server actions, API routes)
components/          UI (game, archive, leaderboard, profile, auth, admin, layout, ui)
lib/                 domain + data access (scoring, money, dates, game/admin services, auth, env)
supabase/migrations  schema, RLS, functions (version-controlled)
supabase/seed.sql    fictional sample questions (development only)
scripts/             local DB, demo data, admin role management
tests/unit|integration|e2e
```

---

## Run it locally

Requirements: Node 20.9+, PostgreSQL 15+ (or Docker for the Supabase CLI).

### Option A — plain PostgreSQL (fastest, no Docker)

This recreates the few Supabase pieces the schema needs (`auth.users`, API roles) with a local-only shim, then applies the real migrations.

```bash
npm install
npm run db:local -- --reset         # creates pricele_dev, applies migrations + sample seed
npm run demo:setup                  # verifies the fictional samples and publishes sets for the last 6 days, today and tomorrow
cp .env.example .env.local          # set DATABASE_URL to the value printed by db:local
npm run dev
```

Gameplay, archive, leaderboards and guest play work. Sign-in needs a Supabase project (Option B, or point the `NEXT_PUBLIC_SUPABASE_*` vars at a hosted dev project).

### Option B — Supabase CLI (full local stack)

```bash
supabase start                      # uses supabase/config.toml
supabase db reset                   # applies migrations and seed.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
  -c "alter role pricele_app with login password 'choose-a-local-password'"
```

Then set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from `supabase status`) and `DATABASE_URL=postgres://pricele_app:<password>@127.0.0.1:54322/postgres` in `.env.local`.

---

## Set up Supabase

1. **Create a project** at supabase.com.
2. **Apply migrations:**
   ```bash
   supabase link --project-ref <ref>
   supabase db push                  # applies supabase/migrations in order
   ```
   Do **not** run `seed.sql` in production (it only contains fictional samples).
3. **Give the app role a password** (SQL editor, as `postgres`):
   ```sql
   alter role pricele_app with login password '<long random password>';
   ```
4. **Build `DATABASE_URL`** from the transaction pooler (Project settings → Database → Connection pooling, port 6543), replacing the user with `pricele_app.<project-ref>`:
   `postgres://pricele_app.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   If your pooler does not accept custom roles, use the direct connection string with the `pricele_app` user (port 5432).
5. **Verify:** `curl https://<your-site>/api/health` returns `{"ok":true}`.

The private `pricele` schema must stay out of *Settings → API → Exposed schemas* (the default).

---

## Authentication

Configured in the Supabase dashboard:

- **URL configuration:** Site URL = your production URL. Redirect URLs: `https://<domain>/auth/callback` (plus `http://localhost:3000/auth/callback` for development and your preview domains).
- **Email:** keep "Confirm email" on. The default templates work: links return to `/auth/callback`, which handles both PKCE `code` and `token_hash` links, and routes password recovery to `/reset-password`.
- **Google:** create an OAuth client in Google Cloud (authorized redirect URI = `https://<ref>.supabase.co/auth/v1/callback`), then enable Auth → Providers → Google with its client ID and secret. Nothing to add to this app's env.
- **SMTP:** configure a custom SMTP provider before launch; Supabase's built-in sender is rate-limited.

Behavior: registration asks for email, password (8+ chars, a letter and a number) and a username (`^[a-z][a-z0-9_]{2,19}$`, stored lowercase, unique). Google sign-ins get a generated `player_xxxxxxxx` username the player can change on their profile. Sign-up and reset responses don't reveal whether an email has an account. All `next=` redirects are restricted to same-site paths.

---

## Create the first administrator

Admin status lives in `public.user_roles`, which the app can't write.

1. Sign up on the site with the operator's email and confirm it.
2. From your machine, with the **owner** connection string (never put it in the web app's env):
   ```bash
   DATABASE_ADMIN_URL='postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
     npm run admin:bootstrap -- you@example.com
   ```
   `bootstrap` refuses to run if any admin already exists. Add more admins explicitly with `npm run admin:grant -- other@example.com`; remove with `npm run admin:revoke -- other@example.com`. Every change is written to the audit log.
3. Visit `/admin`. Non-admins receive a 404 for every admin route; every admin action and database function re-checks the role.

---

## Add and publish daily questions

In `/admin`:

1. **Questions → New question.** Write the prompt and context, pick difficulty and category, and enter the answer key: exact USD amount, what it measures (e.g. *equity value of the announced acquisition*), the reference date or period, and an explanation. Optional: AI drafting assistant (if `AI_PROVIDER_API_KEY` is set) — it only pre-fills wording and never supplies or verifies an answer.
2. **Add at least one source** (title, publisher, URL) with a supporting excerpt or verification note.
3. **Verify** — tick the attestation that you opened the source and it supports the exact amount. The database rejects verification while anything is missing.
4. **Approve.** Editing an approved question returns it to draft and clears verification.
5. **Daily sets → Create a set** for a date (today or future), assign one approved question per difficulty, review validation and variety hints, tick the confirmation and **Publish**. Future sets are *scheduled* and go live at midnight ET on their date; nothing about them is visible before then.
6. **Overview** shows the next 14 days; gaps are flagged. If a day has no set, players see a "not ready yet" message and streaks are not broken; publish today's set late to recover.

**Corrections.** On a published question, *Correct the published answer* requires the new amount, a reason and a source. It records the correction, keeps per-attempt revision rows with old scores, re-scores every official (and practice) attempt with the same formula, recomputes daily results — and therefore leaderboards and streaks — and shows players a correction notice in the reveal.

**Withdrawal policy.** A published set can be returned to draft only while nobody has played it. After play begins, problems are fixed with corrections so every player is treated identically; completed attempts are never deleted or selectively changed.

**Player reports** ("Report a problem with this answer") appear under *Sources and reports*.

---

## Tests

```bash
npm run lint
npm run typecheck
npm test                    # unit (48)
npm run test:integration    # integration + RLS/security (52) — needs local PostgreSQL
npm run test:e2e            # Playwright (11) — builds the app, uses a local DB + auth stand-in
npm run check               # lint + typecheck + unit + integration + build
```

- Integration tests create a throwaway database per file (`TEST_DATABASE_ADMIN_URL`, default `postgres://postgres:postgres@127.0.0.1:5432/postgres`), apply the shim + migrations, and run everything through the same `pricele_app` role the server uses. They cover scoring parity, answer confidentiality, idempotent and concurrent submissions, guest expiry/claiming (including concurrent claims), daily result creation, tie-breaks, weekly boundaries, streak rules (gaps, partial days, days without a set), practice isolation, publication validation, immutability triggers, corrections, suspension, and RLS/privileges for `anon`, `authenticated` and `pricele_app`.
- E2E covers the full guest → account → claim journey, answer non-leakage in served HTML, refresh persistence, archive practice isolation, sign-out/in, admin 404s, the admin create → source → verify → approve → invalid publish → publish → correction flow, and horizontal overflow at 360/390/768/1024/1440px.
- If Playwright can't download its browser, set `PLAYWRIGHT_CHROMIUM_PATH` to a local Chromium.

---

## Deploy

Vercel (recommended):

1. Import the repository. Framework preset: Next.js. Node 20+.
2. Set environment variables for Production (and Preview with a separate Supabase project): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `CRON_SECRET` (optional: `AI_PROVIDER_API_KEY`).
3. `vercel.json` schedules `GET /api/cron/publication-check` at 04:05 and 05:05 UTC (00:05 ET in both DST states). Vercel sends `Authorization: Bearer $CRON_SECRET`. The job promotes scheduled sets and logs gaps; gameplay never depends on it.
4. Run `supabase db push` before deploying code that needs new migrations.
5. Add the production callback URL in Supabase Auth.

**Smoke test after deploy:** `/api/health` → ok · home page shows today's date · play a question as a guest in a private window · sign up, confirm email, claim results · `/leaderboard` lists you · `/admin` is 404 for non-admins · cron endpoint returns 401 without the secret.

**Rollback:** redeploy the previous Vercel build. Migrations are additive; write a new forward migration rather than editing applied ones. Historical scores are never rewritten by deploys — each attempt stores its answer snapshot and `scoring_version`.

**Monitoring:** logs are JSON lines (`lib/logger.ts`) with request ids from `proxy.ts`. Wire an error tracker into `reportError` in `lib/logger.ts`. Uptime-check `/api/health`.

**Troubleshooting:** `permission denied for function` → migrations not fully applied or wrong role in `DATABASE_URL`. Auth redirects to `/login?error=callback` → callback URL missing in Supabase. "Accounts aren't configured" banner → Supabase public env vars missing.

---

## Game rules as implemented

- **Scoring:** `S = round(1000 / (1 + |ln(G) − ln(A)|))`. Exact = 1,000; ×2 or ÷2 ≈ 591; ×10 or ÷10 ≈ 303. Daily total = easy + medium + hard (max 3,000). Difficulty never multiplies points.
- **Error shown:** `|G − A| / A × 100`, stored to 6 decimals, rounded only for display. The results page shows the mean across the day's three questions; profiles show the median and mean across all official answers (labeled).
- **Input:** accepts `1,234.50`, `$25`, `2.5k`, `40 million`, `1.2B`, `3t`. Range $0.01 – $1,000,000,000,000,000; at most two decimals. Validated in the browser and again in Postgres.
- **One official attempt** per question per player, enforced by unique indexes and an advisory lock; retries return the stored result.
- **Leaderboards:** signed-in players who completed all three questions. Order: total ↓, perfect guesses ↓, hard-question points ↓, final submission time ↑, using SQL `rank()`; identical values share a rank and are listed by username. Weekly = Monday–Sunday game dates (Monday 12:00 AM to Monday 12:00 AM ET). Private profiles appear as "Private player"; suspended accounts are excluded. Today's daily board is labeled provisional.
- **Streaks:** consecutive *game days* (dates with a published set) on which all three official questions were completed. A day with no published set neither extends nor breaks a streak (deliberate fairness choice). An unfinished current day doesn't reset the streak until it ends. Archive practice never counts.
- **Guests:** play today's game and the archive with a server-issued HttpOnly session (256-bit token; only its SHA-256 is stored; 30-day expiry). After sign-in, an explicit claim step moves official attempts into the account, preserving timestamps and answer snapshots; days the account already played are skipped; practice is never transferred; the session is then consumed. Inherent limitation: as with any no-login game, someone could play in several browsers and claim their best guest session — equivalent to using multiple accounts, and addressed by the terms and suspensions rather than technically.
- **Account deletion** (profile page) removes the auth user; cascades delete profile, attempts, results and roles.

---

## Security model

- RLS enabled on every table (verified by a test). `anon`/`authenticated` may read only: active categories, live (date ≤ today) sets and their player-facing question columns, public profile columns, and their own attempts/results. No writes. No access to answers, sources, roles, guest sessions, reports, corrections, audit log or rate limits.
- Every `SECURITY DEFINER` function pins `search_path = ''` (verified by a test) and is executable only by `pricele_app` (except four read-only RLS helpers). `bootstrap_admin`/`revoke_admin` are owner-only.
- Published questions, answers and set membership are protected by triggers; answers change only inside the correction function.
- Server actions benefit from Next.js origin checks; auth uses `@supabase/ssr` cookies; `getClaims()` for reads, `getUser()` (server round-trip) for admin and destructive actions.
- Security headers: HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, strict referrer, permissions policy. Logs redact token/password/secret/cookie fields.

---

## Configuration reference

See `.env.example` for every variable. Advertising: `AdSlot` components are placed at `home-secondary`, `archive-inline`, `leaderboard-secondary` and `results-footer` (never inside gameplay forms); they render nothing until `ADVERTISING_ENABLED=true` plus `AD_PROVIDER`/`AD_PUBLISHER_ID` are set, at which point the provider's approved script and consent flow must be added inside `components/shared/ad-slot.tsx`.

---

## Known limitations and remaining work

Stated plainly so nothing is mistaken for verified:

1. **Not run against a real Supabase project.** This build environment couldn't download the Supabase stack (Docker images and Go modules were blocked). Migrations, RLS and functions were tested on PostgreSQL 16 with a local shim of Supabase's `auth` schema and roles. Run `supabase db push` on a staging project and re-run the smoke test before launch.
2. **Auth flows were E2E-tested with a test-only stand-in** (`tests/e2e/support/auth-stub.mjs`) that mimics Supabase Auth's email/password endpoints. **Google OAuth, email confirmation links, and password-reset emails are implemented but unverified** until a real project is connected.
3. **No deployment was performed.**
4. **No real questions.** Only 27 fictional, labeled sample questions ship (for development). Real questions must be researched, sourced and verified by an editor in the dashboard.
5. **Legal pages are starter drafts** marked for review; the operator's name, jurisdiction and contact method must be added (About and Privacy pages have placeholders).
6. Not yet done: automated accessibility audit (axe/Lighthouse) and Core Web Vitals measurement; strict nonce-based CSP; an error-monitoring integration (hook provided); scheduled purge of long-expired guest sessions.
7. `npm audit` reports advisories in ESLint's dev-only dependency chain (`eslint-config-next` → `fast-glob` → `braces`); they don't ship to production.
