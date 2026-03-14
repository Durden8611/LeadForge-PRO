# LeadForge PRO

LeadForge PRO — Real Estate Wholesaling CRM and lead generator.

This repository contains a Next.js app that uses Supabase for authentication and a small `profiles` table for usernames and basic profile data.

## Requirements

- Node 18+ / npm
- A Supabase project (https://supabase.com)

## Environment

Create a `.env.local` file in the project root (copy from `.env.example`) and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)
- Optional: `NEXT_PUBLIC_ADMIN_EMAILS` (comma-separated admin emails allowed to access `/admin`)

Example:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com
```

## Database (Supabase)

Create a `profiles` table in your Supabase DB to store usernames and display names. Example SQL:

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
- The app will attempt to upsert a row into `profiles` after signup (magic link or OAuth). If the table doesn't exist, the auth flow still works but username persistence will be skipped.

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

There is a lightweight admin UI at `/admin` that lists and lets you edit/delete rows from the `profiles` table. Access is controlled by either an `is_admin` flag on the profile row or by the `NEXT_PUBLIC_ADMIN_EMAILS` environment variable.

## Deploying to Vercel

This project is a standard Next.js app and deploys well to Vercel.

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Go to https://vercel.com/new and import the repo.
3. During setup, add the following Environment Variables in the Vercel dashboard (Production/Preview/Development as appropriate):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` (e.g. `https://your-deployment.vercel.app`)
   - `NEXT_PUBLIC_ADMIN_EMAILS` (optional)
4. (Optional) Set the Project Name to `leadforge-pro` and the display name `LeadForge PRO` in Vercel's project settings.

Quick deploy with the Vercel CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
```

## Notes & Next Steps

- Configure OAuth providers (Google, Apple) and email settings in Supabase Dashboard if you want to allow OAuth/magic links.
- Consider adding server-side enforcement for unique usernames (RLS or DB constraints) — the `username` column above has a unique constraint in the sample SQL.

If you want, I can:
- create a small migration script for the `profiles` table,
- set up a GitHub repo and connect it to Vercel,
- or deploy the project for you (you'll need to grant access to your Vercel account).
