# LeadForge PRO

LeadForge PRO — Real Estate Wholesaling CRM and lead generator.

This repository contains a Next.js app that uses Supabase for authentication, a `profiles` table for account metadata, and a `user_progress` table to persist each user's pipeline state.

## Requirements

- Node 18+ / npm
- A Supabase project (https://supabase.com)

## Environment

Create a `.env.local` file in the project root (copy from `.env.example`) and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)

Example:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Database (Supabase)

Run the SQL migrations in the `migrations/` folder in order:

1. `001_create_profiles.sql`
2. `002_enable_rls_and_user_progress.sql`
3. `003_auto_create_profiles_on_signup.sql`
4. `004_add_analytics_and_profile_metadata.sql`

These create:

- `profiles` for account metadata and admin flags
- `user_progress` for saved pipeline state, follow-ups, scripts, and CRM progress per user
- `user_activity` for authenticated app events like sign-ins and page views
- row-level security so each signed-in user can access only their own records unless marked admin

If you want the raw starter SQL, the core `profiles` table looks like this:

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);
```

Notes:
- The database now auto-creates missing profile rows for new auth users via a trigger.
- The app also attempts a fallback profile upsert on callback, sign-in, and app load.
- `profiles` now stores `email` and `last_seen_at` so admin reporting can show who is active.
- Without these migrations, account creation can still work, but admin features and saved user progress will be incomplete.

If your Supabase project already has auth users but the `profiles` table is empty or malformed, run [supabase/repair_profiles_and_auth.sql](supabase/repair_profiles_and_auth.sql). It safely creates any missing tables, restores policies and triggers, normalizes malformed legacy `profiles` columns into `username` / `full_name`, and backfills missing `profiles` rows from `auth.users`.

After repair, run [supabase/verify_profiles.sql](supabase/verify_profiles.sql) to confirm auth users and profile rows match.

## Run locally

Install deps and start the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign up. For magic link signups make sure `NEXT_PUBLIC_SITE_URL` matches your local site and that your Supabase email redirect URL settings include `http://localhost:3000/auth/callback`.

### Use a friendly host name (optional)

If you'd like to open the app as `http://leadforge-pro:3000`, add a hosts entry (requires admin rights):

- Edit `C:\Windows\System32\drivers\etc\hosts` and add:

```
127.0.0.1   leadforge-pro
```

Then run either:

```bash
npm run dev:local
```

or, to automatically add the hosts entry (requires Administrator privileges):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\add-hosts.ps1
npm run dev:local
```

And visit `http://leadforge-pro:3000`.

## Admin UI

There is a lightweight admin UI at `/admin` that lists and lets you edit/delete rows from the `profiles` table. Access is controlled by the `is_admin` flag on the profile row.

To promote an admin account:

```sql
update profiles
set is_admin = true
where id = 'USER_UUID_HERE';
```

Or use [supabase/promote_admin.sql](supabase/promote_admin.sql).

## Deploying to Vercel

This project is a standard Next.js app and deploys well to Vercel.

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Go to https://vercel.com/new and import the repo.
3. If your repository root contains the parent folder shown in this workspace, set the Vercel Root Directory to `leadforge-app`.
4. During setup, add the following Environment Variables in the Vercel dashboard for Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` = `https://leadforge-pro.com`
  - `RENTCAST_API_KEY` for structured real property/public-record lead data
  - `SERPAPI_API_KEY` optional, to improve web-search coverage
  - `ANTHROPIC_API_KEY` to enable AI Negotiation Assistant and Sales Coach
  - `LEADFORGE_AI_MODEL` optional, defaults to `claude-3-5-sonnet-latest`
5. Set the Project Name to `leadforge-pro` and connect the custom domain `leadforge-pro.com` in Vercel.
6. In Supabase Authentication → URL Configuration, set:
  - Site URL: `https://leadforge-pro.com`
  - Redirect URLs:
    - `https://leadforge-pro.com/auth/callback`
    - `https://leadforge-pro.com/auth/reset-password`
    - `https://www.leadforge-pro.com/auth/callback`
    - `https://www.leadforge-pro.com/auth/reset-password`
7. In your DNS provider, point the apex/root domain and `www` to Vercel using Vercel's instructions for the project.
8. Deploy and test the full flow:
  - register a new account
  - verify the email link
  - sign in
  - generate leads from the Leads tab
  - open AI Negotiation Assistant / Sales Coach if `ANTHROPIC_API_KEY` is configured
9. In the Vercel dashboard, open the project and enable Web Analytics so visitor and page-view counts for `leadforge-pro.com` start collecting.
10. In the app admin UI at `/admin`, confirm you can see profile emails, recent activity, and sign-in/page-view counts after logging in.
11. See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for the exact production launch sequence and current integration status.
12. Use [VERCEL_ENV_PRODUCTION.txt](VERCEL_ENV_PRODUCTION.txt) as the paste-ready source for your Vercel Production environment variables.

## Analytics

LeadForge PRO now uses two layers of tracking:

- Vercel Web Analytics for anonymous visitor and page-view counts on the public site
- Supabase `user_activity` records for authenticated in-app events like sign-ins, sign-outs, and page views

This split gives you reliable traffic reporting for `leadforge-pro.com` without having to build your own visitor counter, while still letting you inspect identifiable product usage in Supabase and the admin screen.

Quick deploy with the Vercel CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
```

## Notes & Next Steps

- Configure OAuth providers and email templates in Supabase if you want social login later.
- Real lead generation works best with `RENTCAST_API_KEY`; without it the app falls back to public web research.
- Lead generation and AI routes are now protected and require a signed-in Supabase session.

If you want, I can:
- create a small migration script for the `profiles` table,
- set up a GitHub repo and connect it to Vercel,
- or deploy the project for you (you'll need to grant access to your Vercel account).
