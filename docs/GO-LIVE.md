# Put Pricele online

About 30 minutes. You need a GitHub account (the code is already there), plus free Supabase and
Vercel accounts. Keep a notes file open to paste values into.

## 1. Create the database (Supabase)

1. Go to supabase.com and sign in with GitHub. Click **New project**.
2. Name it `pricele`, choose region **East US**, click **Generate a password** and save it in your
   notes as **DB PASSWORD**. Create the project and wait until it says it's ready.
3. Open **SQL Editor → New query**.
4. On GitHub, open `supabase/setup.sql`, click **Raw**, select all, copy, and paste it into the
   editor. Click **Run**.
5. The result at the bottom shows two values. Save them in your notes:
   - `app_password` as **APP PASSWORD**
   - `cron_secret` as **CRON SECRET**

   Run `setup.sql` only once. If you run it again it creates a new app password, so update
   `DATABASE_URL` in Vercel to match.

## 2. Copy three values from Supabase

1. **Project Settings → Data API**: copy the **Project URL** into your notes.
2. **Project Settings → API Keys**: copy the **Publishable key** (starts with `sb_publishable_`).
3. Click **Connect** (top of the page) → **Transaction pooler**. Copy the connection string, then:
   - change the user from `postgres.<your-project-id>` to `pricele_app.<your-project-id>`
     (keep the dot and the project id),
   - replace `[YOUR-PASSWORD]` with your **APP PASSWORD**.

   Save the result as **DATABASE_URL**. It looks like
   `postgresql://pricele_app.abcdefgh:3f9c...@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

## 3. Put the website online (Vercel)

1. Go to vercel.com, **Sign up with GitHub**, choose the free Hobby plan.
2. Click **Add New → Project**, find **pricele**, click **Import**. (If it isn't listed, click
   **Adjust GitHub App Permissions** and allow the `pricele` repository.)
3. Open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
   | `DATABASE_URL` | the edited connection string |
   | `CRON_SECRET` | CRON SECRET |

4. Click **Deploy** and wait for the confetti. Click the preview to open your site and copy its
   address (for example `https://pricele-abc.vercel.app`). Check `<your address>/api/health`
   shows `{"ok":true}`. If it shows `false`, recheck `DATABASE_URL`.

## 4. Connect sign-in to your site

In Supabase: **Authentication → URL Configuration**

- **Site URL**: your site address
- **Redirect URLs** → **Add URL**: `<your site address>/auth/callback`

## 5. Make yourself the admin

1. On your site, click **Create account**, sign up, and click the link in the confirmation email.
2. In Supabase **SQL Editor**, run (with the email you signed up with):

   ```sql
   select pricele.bootstrap_admin('you@example.com');
   ```

   It should return `"ok": true`. Only the first admin can be created this way.

## 6. Publish the first game

1. On your site, open `/admin` → **Questions**. There are 15 starter questions as drafts.
2. For each: open its source link and check the price still matches (store prices change; edit
   the amount if needed), tick the box, click **Mark answer verified**, then **Approve question**.
3. **Daily sets → Create a set** for today. Assign one easy, one medium and one hard question,
   tick the confirmation, click **Publish set**. Repeat for the next few days.
4. Open your site in a private window and play.

## 7. Use pricele.com (optional)

1. Vercel → your project → **Settings → Domains** → add `pricele.com` and follow the DNS
   instructions at the company where you bought the domain.
2. When it works, add the environment variable `NEXT_PUBLIC_APP_URL` = `https://pricele.com` in
   Vercel and redeploy (**Deployments → ⋯ → Redeploy**).
3. In Supabase **URL Configuration**, set Site URL to `https://pricele.com` and add
   `https://pricele.com/auth/callback` to Redirect URLs.

## Before you share it widely

- Supabase's built-in email sender only sends a few emails per hour. Set up custom SMTP
  (Supabase → Authentication → Emails → SMTP Settings) with a provider such as Resend.
- Add your name and a contact method to the About, Privacy and Terms pages.
- Optional: Google sign-in (see the Authentication section of the README).

## If something goes wrong

| What you see | Fix |
| --- | --- |
| `/api/health` shows `{"ok":false}` | `DATABASE_URL` is wrong: check the `pricele_app.` user and the APP PASSWORD, then redeploy |
| "Accounts aren't configured" banner | The two `NEXT_PUBLIC_SUPABASE_` variables are missing: add them and redeploy |
| Sign-up link goes to an error page | Redirect URL missing in Supabase URL Configuration |
| "Today's game isn't ready yet" | Publish a daily set for today in `/admin` |
| `/admin` shows "page doesn't exist" | Run the `bootstrap_admin` step with the exact email you signed up with |
