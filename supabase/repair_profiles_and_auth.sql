

-- LeadForge PRO: one-shot Supabase repair script
-- Use this if profiles are missing or migrations were only partially applied.
-- This script also normalizes malformed legacy profiles schemas.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();

update public.profiles
set is_admin = false
where is_admin is null;

update public.profiles
set created_at = now()
where created_at is null;

alter table public.profiles alter column is_admin set default false;
alter table public.profiles alter column created_at set default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'Durden8611'
  ) then
    execute 'update public.profiles set username = coalesce(username, "Durden8611") where username is null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'Tyler Hennig'
  ) then
    execute 'update public.profiles set full_name = coalesce(full_name, "Tyler Hennig") where full_name is null';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'Durden8611'
  ) then
    execute 'alter table public.profiles drop column "Durden8611"';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'Tyler Hennig'
  ) then
    execute 'alter table public.profiles drop column "Tyler Hennig"';
  end if;
end;
$$;

create unique index if not exists idx_profiles_username_lower on public.profiles (lower(username));
create index if not exists idx_profiles_created_at on public.profiles (created_at desc);

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_progress_updated_at on public.user_progress (updated_at desc);

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

alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_profile_admin(auth.uid()));

drop policy if exists profiles_insert_self_or_admin on public.profiles;
create policy profiles_insert_self_or_admin
on public.profiles
for insert
to authenticated
with check (auth.uid() = id or public.is_profile_admin(auth.uid()));

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_profile_admin(auth.uid()))
with check (auth.uid() = id or public.is_profile_admin(auth.uid()));

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin
on public.profiles
for delete
to authenticated
using (public.is_profile_admin(auth.uid()));

drop policy if exists user_progress_select_own on public.user_progress;
create policy user_progress_select_own
on public.user_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_progress_insert_own on public.user_progress;
create policy user_progress_insert_own
on public.user_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_progress_update_own on public.user_progress;
create policy user_progress_update_own
on public.user_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_progress_delete_own on public.user_progress;
create policy user_progress_delete_own
on public.user_progress
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
  set full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do update
set full_name = coalesce(excluded.full_name, public.profiles.full_name);