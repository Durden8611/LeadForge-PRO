-- Migration: create profiles table for LeadForge PRO
-- Run this in your Supabase SQL editor or via your migration tooling

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Enforce unique usernames (case-insensitive)
create unique index if not exists idx_profiles_username_lower on profiles (lower(username));

-- Optional: index created_at for query performance
create index if not exists idx_profiles_created_at on profiles (created_at desc);
