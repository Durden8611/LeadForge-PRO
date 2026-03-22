-- Migration: secure profiles and persist per-user LeadForge app progress
-- Run this after 001_create_profiles.sql

create table if not exists user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_progress_updated_at on user_progress (updated_at desc);

create or replace function public.is_profile_admin(check_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user
      and is_admin = true
  );
$$;

revoke all on function public.is_profile_admin(uuid) from public;
grant execute on function public.is_profile_admin(uuid) to authenticated;

alter table profiles enable row level security;
alter table user_progress enable row level security;

drop policy if exists profiles_select_self_or_admin on profiles;
create policy profiles_select_self_or_admin
on profiles
for select
to authenticated
using (auth.uid() = id or public.is_profile_admin(auth.uid()));

drop policy if exists profiles_insert_self_or_admin on profiles;
create policy profiles_insert_self_or_admin
on profiles
for insert
to authenticated
with check (auth.uid() = id or public.is_profile_admin(auth.uid()));

drop policy if exists profiles_update_self_or_admin on profiles;
create policy profiles_update_self_or_admin
on profiles
for update
to authenticated
using (auth.uid() = id or public.is_profile_admin(auth.uid()))
with check (auth.uid() = id or public.is_profile_admin(auth.uid()));

drop policy if exists profiles_delete_admin on profiles;
create policy profiles_delete_admin
on profiles
for delete
to authenticated
using (public.is_profile_admin(auth.uid()));

drop policy if exists user_progress_select_own on user_progress;
create policy user_progress_select_own
on user_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_progress_insert_own on user_progress;
create policy user_progress_insert_own
on user_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_progress_update_own on user_progress;
create policy user_progress_update_own
on user_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_progress_delete_own on user_progress;
create policy user_progress_delete_own
on user_progress
for delete
to authenticated
using (auth.uid() = user_id);