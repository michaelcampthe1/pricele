# Operating Pricele

## Daily routine
- Keep at least a week of sets scheduled. The admin overview shows a 14-day calendar; the cron
  job logs `cron.daily` with `gaps` for unpublished upcoming days.
- If no set is live today, players see "Today's game isn't ready yet". Create and publish a set
  for today — it goes live immediately. Never re-publish an old set as new.

## Logs
All server logs are single-line JSON (`level`, `event`, `requestId`, …) with secrets redacted by
key name. Useful events: `official_guess.submitted`, `official_guess.rpc_failed`,
`guest_claim.completed`, `admin.set_published`, `admin.answer_corrected`, `cron.daily`,
`request.unhandled_error`. Every response carries an `x-request-id` header for correlation.
To add Sentry or similar, forward from `lib/errors/log.ts` and `instrumentation.ts`.

## Troubleshooting

| Symptom | Check |
|---|---|
| "Pricele is missing or has invalid public configuration" | `NEXT_PUBLIC_*` variables in the deployment; rebuild after changing them (they're inlined at build time). |
| "server configuration is invalid" | `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) set on the server; `CRON_SECRET` ≥ 32 chars. |
| Sign-in link says "invalid or expired" | Redirect URLs in Supabase include `/auth/callback` and `/auth/confirm` for this domain; link not already used. |
| Google button missing | `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` and redeploy. |
| `/admin` returns 404 | Account lacks the role: `npm run admin:list`, then `admin:grant`. |
| Players report "You're going a little fast" | Rate limits in `lib/security/rate-limit.ts` (per player / hashed IP). Shared NAT networks may need a higher `guestCreate` limit. |
| Cron returns 503 | `CRON_SECRET` not configured. 401: header mismatch. |
| Leaderboard looks wrong after a fix | Use the correction workflow; it recomputes results. Manual SQL edits bypass the audit trail. |

## Data retention
Unclaimed guest sessions (and their guesses) are deleted 30 days after expiry; rate-limit rows
after a day. Account deletion cascades a player's attempts, results and practice. Audit-log and
correction rows keep a null admin reference if an admin account is deleted.
