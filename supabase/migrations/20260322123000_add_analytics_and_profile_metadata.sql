-- Migration: add profile reporting fields and authenticated activity tracking

alter table public.profiles
  add column if not exists email text,
  add column if not exists last_seen_at timestamptz;

create index if not exists idx_profiles_email_lower on public.profiles (lower(email));
create index if not exists idx_profiles_last_seen_at on public.profiles (last_seen_at desc);

update public.profiles p
set
  email = coalesce(p.email, u.email),
  last_seen_at = coalesce(p.last_seen_at, u.last_sign_in_at, p.created_at, now())
from auth.users u
where u.id = p.id;

create table if not exists public.user_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_user_created on public.user_activity (user_id, created_at desc);
create index if not exists idx_user_activity_event_created on public.user_activity (event_type, created_at desc);

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

alter table public.user_activity enable row level security;

drop policy if exists user_activity_select_own_or_admin on public.user_activity;
create policy user_activity_select_own_or_admin
on public.user_activity
for select
to authenticated
using (auth.uid() = user_id or public.is_profile_admin(auth.uid()));

drop policy if exists user_activity_insert_own on public.user_activity;
create policy user_activity_insert_own
on public.user_activity
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_activity_delete_admin on public.user_activity;
create policy user_activity_delete_admin
on public.user_activity
for delete
to authenticated
using (public.is_profile_admin(auth.uid()));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, last_seen_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.last_sign_in_at, now())
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email),
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      last_seen_at = coalesce(excluded.last_seen_at, public.profiles.last_seen_at);

  return new;
end;
$$;