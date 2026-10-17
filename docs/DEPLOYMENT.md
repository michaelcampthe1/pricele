# Deploying Pricele

Target: **Vercel** (Next.js) + **Supabase** (database & auth). Any Node 22 host that runs
`next build && next start` works the same way; replace the cron step with your scheduler.

## 1. Supabase (production project)

1. Create the project; choose a region near your users.
2. Push migrations (the seed is never pushed):
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Auth settings — see README "Configure Supabase": Site URL, redirect URLs
   (`/auth/callback`, `/auth/confirm`), email confirmations ON, custom SMTP, password policy
   (min 8, letters + digits), Google provider if used.
4. Keep the secret key out of git and out of any `NEXT_PUBLIC_` variable.

## 2. Vercel

1. Import the repository. Framework preset: Next.js. Node 22.
2. Environment variables (Production, and separately for Preview with a staging Supabase project):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SECRET_KEY` | secret key (server only) |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | `true` once Google is configured |
   | `AI_PROVIDER_API_KEY` | optional |
   | `ADVERTISING_ENABLED` | `false` |

3. **Cron**: `vercel.json` schedules `GET /api/cron/daily` at 04:10 and 05:10 UTC (00:10 ET in
   both daylight and standard time). Vercel sends `Authorization: Bearer $CRON_SECRET`
   automatically when `CRON_SECRET` is set. Hobby plans may limit cron frequency — one run at
   05:10 UTC is enough, because games go live by date regardless of the job.
4. Deploy. HTTPS and secure cookies are automatic (`Secure` is set on the guest cookie when
   `NODE_ENV=production`; HSTS is sent in production).

## 3. After the first deploy

1. Sign up with the operator account and confirm the email.
2. `ENV_FILE=.env.production npm run admin:grant -- operator@example.com`
3. Publish at least today's and tomorrow's sets (README "Publishing daily questions").

## Smoke-test checklist

- [ ] `/` loads; `/play` shows today's game (or the "not ready" state if none is published)
- [ ] As a guest, answer a question → answer, points, source link shown; refresh keeps progress
- [ ] View source of `/play` before answering: no answer amounts present
- [ ] Sign up → confirmation email arrives → link signs you in
- [ ] Claim guest progress → result appears on `/leaderboard`
- [ ] Password reset email → `/reset-password` works
- [ ] Google sign-in (if enabled)
- [ ] `/admin` as admin works; as a normal user returns 404
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily` → `{"ok":true,…}`;
      without the header → 401
- [ ] `/robots.txt` disallows `/admin`, `/profile`, `/auth/`

## Rollback

- **App**: promote the previous deployment in Vercel (instant).
- **Database**: migrations are forward-only. Before `db push` to production, take a backup
  (Supabase → Database → Backups, or `pg_dump`). To undo a migration, write a new migration that
  reverses it; don't edit applied migration files. Run the integration suite against a staging
  project or local stack first.
- **Bad question**: use the correction or withdrawal workflow — never edit rows by hand, so that
  scores, leaderboards and the audit trail stay consistent.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, the production build, and the
integration + E2E suites against a local Supabase stack started inside the runner.
