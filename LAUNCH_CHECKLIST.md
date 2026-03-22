# LeadForge PRO Launch Checklist

This file is the shortest path from the current repo state to a real production launch.

## Code Status

- Production build passes locally.
- Auth flow is wired for signup, login, callback, and password reset.
- Lead search API requires a valid signed-in Supabase user session.
- AI features run through a server-side Anthropic proxy instead of browser-direct calls.
- User progress persistence requires the `user_progress` table from the second migration.

## External Status

### 1. RentCast API is active

A direct validation call to `https://api.rentcast.io/v1/properties` now returns:

- `200 OK`
- structured property data

That means:

- the RentCast key is authorized
- provider-backed real property data is available to the app
- production still needs the same key set in Vercel

### 2. Anthropic is still optional but currently not configured here

If `ANTHROPIC_API_KEY` is not set in production:

- AI Negotiation Assistant will not work
- Sales Coach AI will not work
- public-web enrichment in lead research will skip Anthropic enrichment

The rest of the app can still launch without it.

## Required Supabase Setup

Run these files in Supabase SQL Editor, in order:

1. [migrations/001_create_profiles.sql](migrations/001_create_profiles.sql)
2. [migrations/002_enable_rls_and_user_progress.sql](migrations/002_enable_rls_and_user_progress.sql)
3. [migrations/003_auto_create_profiles_on_signup.sql](migrations/003_auto_create_profiles_on_signup.sql)
4. [migrations/005_create_leads_buyers_deals.sql](migrations/005_create_leads_buyers_deals.sql)

This creates:

- `profiles`
- `user_progress`
- row-level security for both tables
- admin helper function used by policies

If `auth.users` already has accounts but `profiles` is empty or malformed, run [supabase/repair_profiles_and_auth.sql](supabase/repair_profiles_and_auth.sql) instead of guessing which migration was missed. Then run [supabase/verify_profiles.sql](supabase/verify_profiles.sql) to confirm the backfill.

## Required Supabase Auth Settings

In Supabase Authentication -> URL Configuration:

- Site URL: `https://leadforge-pro.com`
- Redirect URLs:
  - `https://leadforge-pro.com/auth/callback`
  - `https://leadforge-pro.com/auth/reset-password`
  - `https://www.leadforge-pro.com/auth/callback`
  - `https://www.leadforge-pro.com/auth/reset-password`

If you also use local dev with the custom hosts entry, add:

- `http://leadforge-pro:3000/auth/callback`
- `http://leadforge-pro:3000/auth/reset-password`

## Required Vercel Production Environment Variables

Set these in Vercel for Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL=https://leadforge-pro.com`
- `RENTCAST_API_KEY`

Optional but recommended:

- `SERPAPI_API_KEY`
- `ANTHROPIC_API_KEY`
- `LEADFORGE_AI_MODEL=claude-3-5-sonnet-latest`

Use [VERCEL_ENV_PRODUCTION.txt](VERCEL_ENV_PRODUCTION.txt) as the exact value sheet.

## Required Domain Setup

In Vercel:

1. Attach `leadforge-pro.com`
2. Attach `www.leadforge-pro.com`

In DNS:

1. Point the apex/root domain to Vercel
2. Point `www` to Vercel

Use the exact values Vercel gives for your project.

## Required First-Run Checks

After deploy:

1. Register a new user
2. Verify the email confirmation link works
3. Sign in and reach `/app`
4. Refresh and confirm the session persists
5. Generate leads
6. Refresh and confirm pipeline progress persists
7. Request a password reset and complete it
8. If Anthropic is configured, test AI Negotiation Assistant and Sales Coach

## Optional Admin Setup

Admin access is controlled by:

- `profiles.is_admin = true`

The admin UI is at [pages/admin.js](pages/admin.js).

Use [supabase/promote_admin.sql](supabase/promote_admin.sql) to promote your account after profiles exist.

## Launch Decision Summary

You can launch now if all of these are true:

- Supabase migrations are applied
- Supabase auth URLs are configured
- Vercel env vars are set
- Domain DNS points to Vercel

You can launch without Anthropic.

Provider-backed RentCast property data is available once the production environment uses the active key.