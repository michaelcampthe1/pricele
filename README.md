# Pricele

A daily price-guessing game. Every day at midnight Eastern Time, everyone gets the same three
questions — Easy, Medium and Hard — each asking for one real-world price in US dollars. One guess
per question, up to 1,000 points each, 3,000 per day.

Stack: Next.js 16 (App Router, TypeScript strict, Tailwind CSS 4) · Supabase (Postgres, Auth, RLS) ·
Zod · Vitest · Playwright. Deploys to Vercel (or any Next.js host) + Supabase.

- [Architecture and key decisions](#architecture)
- [Run locally](#run-locally)
- [Tests](#tests)
- [Configure Supabase](#configure-supabase) · [Authentication](#authentication) · [First administrator](#first-administrator)
- [Publishing daily questions](#publishing-daily-questions)
- [Deploy](docs/DEPLOYMENT.md) · [Operations & troubleshooting](docs/OPERATIONS.md)

---

## Architecture

```
app/                  Routes (server components by default)
  play/ results/ archive/ leaderboard/ profile/ share/   Player pages
  login/ signup/ forgot-password/ reset-password/ auth/  Auth (callback, confirm, signout)
  admin/              Dashboard (server-gated: user_roles)
  api/cron/daily/     Scheduled maintenance (Bearer CRON_SECRET)
components/           UI (ui/, game/, admin/, …)
lib/
  game/               Public set reads, progress, server actions (submit/practice/reveal)
  scoring/            Reference scoring implementation (parity-tested against SQL)
  money/ dates/       Exact-decimal parsing/formatting · America/New_York calendar
  security/           Guest sessions, rate limiting, safe redirects
  auth/ admin/ leaderboard/ stats/ ai/ supabase/ errors/ validation/
supabase/
  migrations/         Schema, RLS, SQL functions (version controlled)
  seed.sql            Development-only sample content
tests/ unit/ integration/ e2e/ support/
scripts/admin-role.ts Grant / revoke / list administrators
```

### Decisions worth knowing

| Topic | Decision |
|---|---|
| **Authoritative scoring** | `public.pricele_score(guess, answer)` in Postgres — `round(1000 / (1 + abs(ln(G) − ln(A))))` on exact `numeric` values. It runs inside the submission transaction, so the answer key never leaves the database before the guess is stored. `lib/scoring` mirrors it for tests/docs and is parity-tested on 2,000 random pairs. |
| **Money** | `numeric(18,2)` everywhere; amounts cross every boundary (SQL→JSON→TS) as decimal **strings** (`::text` casts) because JSON numbers become doubles. Bounds: $0.01 – $1,000,000,000,000,000. Guess input accepts `25,000`, `$25,000.50`, `2.5m`, `3b`, `40k`. |
| **Atomic, idempotent submissions** | `submit_official_guess` (SECURITY DEFINER, service_role only) validates identity → returns any existing attempt (retries are free) → checks the question is in **today's** live set (server clock, ET) → scores → inserts with unique constraints → updates `daily_results` under a per-(set,user) advisory lock. Concurrency tests cover duplicate and simultaneous final submissions. |
| **Answer confidentiality** | Answers/sources live in tables with no API grants or RLS policies. Public pages read questions through an anonymous client limited by RLS + column grants; future sets are invisible. E2E tests assert answers are absent from page HTML before guessing. |
| **Function privileges** | PostgreSQL grants `EXECUTE` to `PUBLIC` by default; migration `…0600_function_privileges.sql` revokes it and re-grants a minimal allow-list. An integration test audits `pg_proc` ACLs so a new function can't silently become callable. |
| **Guest play** | Server-issued 256-bit token in an HttpOnly, SameSite=Lax (Secure in prod) cookie; only SHA-256(token) is stored; 30-day expiry. Created lazily on first guess, rate-limited per IP. |
| **Guest claiming** | `claim_guest_session` moves attempts in one transaction, set by set; skips any set the account already played (no merging, no double counting); re-validates that each attempt was submitted on its set's ET date; marks the session claimed (single use). Practice never becomes official. |
| **Daily lifecycle** | Sets go `draft → scheduled (future) / published (today)`. A set is visible when `status ∈ {scheduled, published}` **and** `game_date ≤ today (ET)` — so the game goes live at midnight even if the cron job is late. No set ⇒ an "unavailable" state; nothing is fabricated or reused. |
| **Leaderboards & streaks** | SQL functions over completed official results only (practice, incomplete days and suspended players excluded). Tie-breaks: total → perfect guesses (exactly 1,000) → Hard points → earlier final submission (for weekly/all-time: completion time of the latest counted game). `RANK()` gives identical players the same rank; display order inside a tie is by username. Weeks are Monday–Monday ET. A streak is consecutive ET dates with a completed game; the current streak is the run ending today or yesterday. |
| **Corrections** | `admin_correct_answer` rescored every attempt identically, keeps `original_score`/`original_answer_snapshot`, logs to `question_corrections` + audit log, recomputes results (leaderboards/streaks are derived). **Withdrawal** voids a question for everyone; the day completes on the remaining questions. Published wording is never editable. |
| **Rate limiting** | Fixed-window counters in Postgres (`check_rate_limit`), shared across serverless instances. Generous limits; official retries are idempotent anyway. |
| **Caching** | Next.js Cache Components are **off**: almost every page is personalized and answer-bearing data must never be cached across players. Pages render per request. |
| **Admin authorization** | Three layers: `/admin` layout (404 for non-admins), every server action (`assertAdmin`), and every SQL admin function (`private.assert_admin`). Roles live in `user_roles`, which users can't write; only `scripts/admin-role.ts` grants them. |
| **AI drafting (optional)** | Admin-only "Suggest ideas" using the Anthropic SDK with structured output. Suggestions contain **no answers or citations**; they only pre-fill a draft, which must go through sources → verify → approve like any other. Disabled when `AI_PROVIDER_API_KEY` is unset. |
| **Ads** | `<AdSlot placement=…>` renders nothing unless `ADVERTISING_ENABLED=true` and a provider is configured; never placed in `/play`. No ad network is integrated. |

Statistic definitions: *total official points* and *games completed* count completed official days
(same basis as the all-time board). *Average/median error* is the absolute percentage error
`|guess − answer| ÷ answer` across all official guesses. *Perfect guess* = a 1,000-point score
(within ~0.05% of the answer).

---

## Run locally

Requirements: Node 22+, Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # Postgres, Auth, REST on :54321/:54322; applies migrations + seed
cp .env.example .env.local  # then fill in the values printed by `npx supabase status`
npm run dev                 # http://localhost:3000
```

`.env.local` for the local stack:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `npx supabase status`>
SUPABASE_SECRET_KEY=<SECRET_KEY from `npx supabase status`>
CRON_SECRET=<any 32+ character string>
```

The seed creates seven days of clearly labeled **SAMPLE** games about fictional items, so the
game is playable immediately. They are unverified placeholder data and show a "Sample content"
banner. `npx supabase db reset` rebuilds the database from migrations + seed. Emails sent
locally (confirmations, password resets) appear in Mailpit at http://127.0.0.1:54324.

> If your Docker environment can't pull from `public.ecr.aws`, run with
> `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start`.

Useful scripts: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:types`
(regenerate `lib/supabase/database.types.ts` after schema changes).

---

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | Unit: scoring formula & edge cases, money parsing/formatting, ET dates & DST, redirect safety, share text, validation | — |
| `npm run test:integration` | Real database: submissions, idempotency, concurrency, guest sessions/claiming, practice isolation, leaderboards & tie-breaks, weekly boundaries, streaks, publication validation, corrections/withdrawal, RLS/answer confidentiality, function-privilege audit, TS↔SQL scoring parity | `supabase start` |
| `npm run build && npm run test:e2e` | Playwright on a production build: full guest → signup → claim → leaderboard → archive practice → sign out/in journey; admin create → source → verify → approve → schedule → invalid publish rejected → publish → correction; publish-for-today is playable with hidden answers; cron auth; no horizontal overflow at 360/390/768/1024/1440 px; axe WCAG 2.2 AA scan; mobile gameplay | `supabase start`, built app |

Integration and E2E helpers refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` points at
`localhost`/`127.0.0.1`, so they can't touch production data. They create their own users and
sets and are safe to re-run. If the bundled Chromium differs from Playwright's, set
`PLAYWRIGHT_CHROMIUM_PATH`.

---

## Configure Supabase

1. Create a project at supabase.com. Note the project URL, the **publishable** key and a
   **secret** key (Project Settings → API Keys). Legacy `anon` / `service_role` keys also work
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`).
2. Apply migrations (never the seed) from your machine or CI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Authentication → URL Configuration: Site URL = your production URL; add
   `https://<domain>/auth/callback` and `https://<domain>/auth/confirm` (plus preview URLs) to
   Redirect URLs.
4. Authentication → Providers → Email: enable email confirmations for production. Set a custom
   SMTP provider (Supabase's built-in sender is heavily rate-limited).
5. Optional: change the email templates to the token-hash flow, e.g. confirmation link
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/` and recovery link
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`.
   The default PKCE links through `/auth/callback` also work.

## Authentication

- **Email/password**: works out of the box. Passwords need 8+ characters with a letter and a number
  (enforced in the app and in `supabase/config.toml`; mirror it in the dashboard for production).
- **Google OAuth**: create an OAuth client in Google Cloud (Web application) with authorized
  redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Enter the client ID and
  secret in Supabase → Authentication → Providers → Google, then set
  `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` to show the button. Locally: export
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, set
  `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, and restart.
  Google users get a generated `player_xxxxxxxx` username and are prompted to choose one.
- Sessions use `@supabase/ssr` cookies, refreshed in `proxy.ts`; identity is verified with
  `auth.getClaims()`. `?next=` redirects are restricted to same-origin paths.
- Account deletion is self-service on `/profile` and cascades the player's attempts, results and
  practice history.

## First administrator

Nothing in the web app grants roles, and signing up never makes anyone an admin.

```bash
# 1. Sign up on the site with the operator's email and confirm it.
# 2. With production credentials in the environment (or ENV_FILE=.env.production):
npm run admin:grant -- operator@example.com      # idempotent; or set ADMIN_BOOTSTRAP_EMAIL
npm run admin:list
# Revoke:
npm run admin:revoke -- operator@example.com
```

The script refuses unconfirmed emails and writes an audit-log entry. Verify by visiting `/admin`
(non-admins get a 404).

## Publishing daily questions

1. **Admin → Questions → New question.** Write the player-facing prompt (one precisely defined
   USD amount), pick difficulty and category, and fill the confidential answer key: exact amount,
   definition (e.g. "equity value"), reference date or period, explanation. Possible duplicates
   are flagged on the question page.
2. **Add sources** (title, publisher, URL, supporting excerpt). At least one is required.
3. **Verify**: open the sources, tick the attestation, add notes. Any later change to the answer,
   definition, reference or sources resets verification.
4. **Approve for scheduling.**
5. **Admin → Daily sets**: create a set for an ET date, assign position 1 (Easy), 2 (Medium),
   3 (Hard). The checklist shows every validation problem.
6. **Publish**: type the date to confirm. Future dates become *scheduled* and go live at
   midnight ET automatically; today's date goes live immediately. Questions are then locked.
7. The overview's 14-day calendar shows gaps; the cron job logs a warning for unpublished upcoming days.

**Corrections**: on a published question, *Correct the answer* (new amount, reason, source,
public note, type `CORRECT`) rescoring everyone identically, or *Withdraw* (type `WITHDRAW`) to
void it for all players.

---

## Configuration reference

See [`.env.example`](.env.example). Required: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` (production).
Optional: `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, `AI_PROVIDER_API_KEY` / `AI_MODEL`
(default `claude-opus-5-5`), `ADVERTISING_ENABLED` / `AD_PROVIDER` / `AD_PUBLISHER_ID`,
`NEXT_PUBLIC_CONTACT_EMAIL`. Missing required values produce a descriptive error at the point
of use. Server secrets never use the `NEXT_PUBLIC_` prefix; the build output was checked for
leaked keys.

## Known limitations

- **Legal pages** are starter drafts describing actual data practices; they must be reviewed by a
  lawyer and completed with the operator's details before launch.
- **Guest multi-session play**: a person could play as several guests (different browsers) and
  claim the best session. Claims are single-use per session and per day per account, but this
  can't be fully prevented without requiring sign-in before playing.
- **AI drafting** is implemented against the Anthropic SDK and type-checked, but was not exercised
  against the live API here (no key available).
- **Ads**: only the reserved placements exist; no provider script or consent banner is integrated.
- **Monitoring**: structured JSON logs + `instrumentation.ts` `onRequestError` hook; no external
  service is wired in.
